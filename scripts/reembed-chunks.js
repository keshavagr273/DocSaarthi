#!/usr/bin/env node
/**
 * Re-embed chunks that were vectorised with a different embedding model.
 *
 * Semantic search only compares vectors produced by the same model, so after
 * changing EMBEDDING_PROVIDER / DEFAULT_EMBEDDING_MODEL every document still
 * carrying the old model's vectors silently drops out of semantic results.
 *
 * This re-embeds the chunk text that is already in the database. It does not
 * touch object storage, so it also repairs documents whose original file is
 * no longer in storage and which therefore cannot be reprocessed at all.
 *
 * For anything else — wrong OCR, bad classification, no extracted fields —
 * use `npm run reprocess` instead; this only replaces vectors.
 *
 * Usage:
 *   node scripts/reembed-chunks.js --dry-run
 *   node scripts/reembed-chunks.js --yes
 *   node scripts/reembed-chunks.js --yes --model text-embedding-3-small   # only this stale model
 */
const { PrismaClient } = require('@prisma/client');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const DRY_RUN = has('--dry-run');
const YES = has('--yes');
const ONLY_MODEL = valueOf('--model', null);
const BATCH = 96; // Cohere's per-request limit

const PROVIDER = (process.env.EMBEDDING_PROVIDER ?? 'cohere').toLowerCase();
const TARGET_MODEL =
  process.env.DEFAULT_EMBEDDING_MODEL ??
  (PROVIDER === 'cohere' ? 'embed-v4.0' : 'text-embedding-3-small');
const DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? 1536);
const COHERE_KEY = process.env.COHERE_API_KEY || process.env.EMBEDDING_API_KEY;

async function embedWithCohere(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => t.trim() || ' ');
    const res = await fetch('https://api.cohere.com/v2/embed', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${COHERE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: TARGET_MODEL,
        texts: batch,
        input_type: 'search_document',
        embedding_types: ['float'],
        truncate: 'END',
      }),
    });
    if (!res.ok) throw new Error(`Cohere ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const vecs = data.embeddings?.float;
    if (!Array.isArray(vecs) || vecs.length !== batch.length) {
      throw new Error(`Cohere returned ${vecs?.length} vectors for ${batch.length} texts`);
    }
    out.push(...vecs);
  }
  return out;
}

async function embedWithOpenAI(texts) {
  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.EMBEDDING_BASE_URL || undefined,
  });
  const res = await client.embeddings.create({
    model: TARGET_MODEL,
    input: texts,
    encoding_format: 'float',
  });
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function main() {
  const prisma = new PrismaClient();
  console.log(`target model: ${TARGET_MODEL} (${PROVIDER}, ${DIMENSION} dims)\n`);

  const stale = await prisma.$queryRawUnsafe(
    `SELECT e.id, e."chunkId", e.model, c.content, d.id AS document_id, d.title
     FROM document_embeddings e
     JOIN document_chunks c ON c.id = e."chunkId"
     JOIN documents d ON d.id = e."documentId"
     WHERE e.model <> $1 ${ONLY_MODEL ? 'AND e.model = $2' : ''}
     ORDER BY d."createdAt"`,
    ...(ONLY_MODEL ? [TARGET_MODEL, ONLY_MODEL] : [TARGET_MODEL]),
  );

  if (stale.length === 0) {
    console.log('No stale embeddings — every vector matches the current model.');
    await prisma.$disconnect();
    return;
  }

  const byDoc = new Map();
  for (const row of stale) {
    const e = byDoc.get(row.document_id) ?? { title: row.title, models: new Set(), n: 0 };
    e.models.add(row.model);
    e.n += 1;
    byDoc.set(row.document_id, e);
  }
  console.table(
    [...byDoc.values()].map((d) => ({
      title: d.title.slice(0, 34),
      from: [...d.models].join(','),
      vectors: d.n,
    })),
  );
  console.log(`\n${stale.length} vector(s) across ${byDoc.size} document(s)`);

  if (DRY_RUN) { console.log('\n--dry-run: nothing changed.'); await prisma.$disconnect(); return; }
  if (!YES) { console.log('\nRefusing to run without --yes.'); await prisma.$disconnect(); return; }

  const texts = stale.map((r) => r.content);
  console.log(`\nembedding ${texts.length} chunk(s)...`);
  const vectors =
    PROVIDER === 'cohere' && COHERE_KEY
      ? await embedWithCohere(texts)
      : await embedWithOpenAI(texts);

  let updated = 0;
  for (let i = 0; i < stale.length; i++) {
    const vec = vectors[i];
    if (!Array.isArray(vec) || vec.length !== DIMENSION) {
      throw new Error(
        `dimension mismatch for chunk ${stale[i].chunkId}: got ${vec?.length}, expected ${DIMENSION}`,
      );
    }
    await prisma.$executeRawUnsafe(
      `UPDATE document_embeddings
       SET embedding = $1::vector, model = $2, dimension = $3
       WHERE id = $4`,
      `[${vec.join(',')}]`,
      TARGET_MODEL,
      DIMENSION,
      stale[i].id,
    );
    updated++;
  }

  console.log(`\nre-embedded ${updated} vector(s) as "${TARGET_MODEL}"`);
  console.table(
    await prisma.$queryRawUnsafe(
      `SELECT model, dimension, COUNT(*)::int n FROM document_embeddings GROUP BY 1,2`,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error('FAILED:', e.message ?? e); process.exit(1); });
