#!/usr/bin/env node
/**
 * Re-run the ingestion pipeline over documents that are already uploaded.
 *
 * Use this after fixing a configuration or pipeline bug that produced bad
 * results — a wrong DEFAULT_LLM_MODEL (every document lands as UNKNOWN with no
 * fields), an embedding provider change (old vectors are not comparable to new
 * query vectors), or a chunking change.
 *
 * The API must be running: this only enqueues jobs, the API's ProcessorModule
 * consumes them.
 *
 * Human-verified fields are preserved by the pipeline itself
 * (StructuredExtractionStage keeps rows with isVerified/isRejected set), so a
 * reprocess does not discard manual corrections.
 *
 * Usage:
 *   node scripts/reprocess-documents.js --dry-run
 *   node scripts/reprocess-documents.js --stale-embeddings --no-fields
 *   node scripts/reprocess-documents.js --all --concurrency 2
 *   node scripts/reprocess-documents.js --id cmv3... --id cmv4...
 *
 * Selectors (combine freely; default is --needs-repair):
 *   --all                every non-deleted document
 *   --needs-repair       union of the four selectors below
 *   --no-fields          zero extracted fields
 *   --bad-category       category is NULL or UNKNOWN
 *   --stale-embeddings   has embeddings from a model other than the current one
 *   --no-chunks          zero chunks (nothing searchable)
 *   --stuck              status QUEUED/PROCESSING with no terminal state
 *   --id <documentId>    a specific document (repeatable)
 *
 * Options:
 *   --dry-run            list what would be enqueued and exit
 *   --fail-unusable      give documents whose source file is gone a terminal
 *                        FAILED state instead of leaving them QUEUED forever
 *   --concurrency <n>    jobs in flight (default 1; the API processes 1 at a time)
 *   --poll-seconds <n>   how long to wait between progress checks (default 10)
 *   --timeout-minutes<n> give up waiting after this long (default 45)
 *   --yes                skip the confirmation prompt
 */
const { PrismaClient } = require('@prisma/client');
const Queue = require('bull');
const {
  S3Client,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

// ── argument parsing ────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valuesOf = (flag) =>
  argv.reduce((acc, a, i) => (a === flag && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const numberOf = (flag, fallback) => {
  const raw = valuesOf(flag)[0];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const OPTS = {
  dryRun: has('--dry-run'),
  failUnusable: has('--fail-unusable'),
  yes: has('--yes'),
  concurrency: Math.max(1, numberOf('--concurrency', 1)),
  pollSeconds: Math.max(2, numberOf('--poll-seconds', 10)),
  timeoutMinutes: Math.max(1, numberOf('--timeout-minutes', 45)),
  ids: valuesOf('--id'),
};

const SELECTORS = {
  all: has('--all'),
  noFields: has('--no-fields'),
  badCategory: has('--bad-category'),
  staleEmbeddings: has('--stale-embeddings'),
  noChunks: has('--no-chunks'),
  stuck: has('--stuck'),
};
const anySelector = Object.values(SELECTORS).some(Boolean) || OPTS.ids.length > 0;
const needsRepair = has('--needs-repair') || !anySelector;

const CURRENT_EMBEDDING_MODEL =
  process.env.DEFAULT_EMBEDDING_MODEL ??
  ((process.env.EMBEDDING_PROVIDER ?? 'cohere').toLowerCase() === 'cohere'
    ? 'embed-v4.0'
    : 'text-embedding-3-small');

// ── storage (to confirm the source file still exists) ───────────────
function buildS3() {
  let endpoint = (process.env.MINIO_ENDPOINT || 'localhost').trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const port = Number(process.env.MINIO_PORT ?? 9000);
  const isCloudflare = endpoint.includes('r2.cloudflarestorage.com');
  const useSSL =
    String(process.env.MINIO_USE_SSL) === 'true' || port === 443 || isCloudflare;
  const protocol = useSSL ? 'https' : 'http';
  const url =
    port === 443 || port === 80 || isCloudflare || !port
      ? `${protocol}://${endpoint}`
      : `${protocol}://${endpoint}:${port}`;

  return {
    bucket: process.env.MINIO_BUCKET || 'docsaarthi',
    client: new S3Client({
      endpoint: url,
      region: isCloudflare ? 'auto' : 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY,
        secretAccessKey: process.env.MINIO_SECRET_KEY,
      },
      forcePathStyle: true,
    }),
  };
}

function buildQueue() {
  const url = (process.env.REDIS_URL || 'redis://localhost:6379').trim();
  const parsed = new URL(url);
  return new Queue('document-processing', {
    redis: {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
      ...(url.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    prefix: (process.env.REDIS_PREFIX || 'docsaarthi:').trim(),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function selectDocuments(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT d.id, d.title, d.status::text AS status, d."mimeType", d."userId",
           COALESCE(d.category::text, '-') AS category,
           v.id AS version_id, v."storageKey" AS storage_key,
           (SELECT COUNT(*)::int FROM document_fields f WHERE f."documentId" = d.id) AS fields,
           (SELECT COUNT(*)::int FROM document_fields f
             WHERE f."documentId" = d.id AND f."isVerified") AS verified,
           (SELECT COUNT(*)::int FROM document_chunks c WHERE c."versionId" = v.id) AS chunks,
           COALESCE((SELECT string_agg(DISTINCT e.model, ',')
             FROM document_embeddings e WHERE e."versionId" = v.id), '') AS models
    FROM documents d
    JOIN document_versions v ON v.id = COALESCE(d."currentVersionId", (
      SELECT dv.id FROM document_versions dv WHERE dv."documentId" = d.id
      ORDER BY dv."versionNumber" DESC LIMIT 1))
    WHERE d."isDeleted" = false
    ORDER BY d."createdAt"`,
  );

  return rows
    .map((r) => {
      const models = r.models ? r.models.split(',').filter(Boolean) : [];
      const reasons = [];
      if (r.fields === 0) reasons.push('no-fields');
      if (r.category === '-' || r.category === 'UNKNOWN') reasons.push('bad-category');
      if (models.some((m) => m !== CURRENT_EMBEDDING_MODEL)) reasons.push('stale-embeddings');
      if (r.chunks === 0) reasons.push('no-chunks');
      if (r.status !== 'COMPLETED' && r.status !== 'FAILED') reasons.push('stuck');
      return { ...r, models, reasons };
    })
    .filter((r) => {
      if (OPTS.ids.length > 0) return OPTS.ids.includes(r.id);
      if (SELECTORS.all) return true;
      if (needsRepair) {
        return ['no-fields', 'bad-category', 'stale-embeddings', 'no-chunks', 'stuck']
          .some((x) => r.reasons.includes(x));
      }
      return (
        (SELECTORS.noFields && r.reasons.includes('no-fields')) ||
        (SELECTORS.badCategory && r.reasons.includes('bad-category')) ||
        (SELECTORS.staleEmbeddings && r.reasons.includes('stale-embeddings')) ||
        (SELECTORS.noChunks && r.reasons.includes('no-chunks')) ||
        (SELECTORS.stuck && r.reasons.includes('stuck'))
      );
    });
}

async function main() {
  const prisma = new PrismaClient();
  const { client: s3, bucket } = buildS3();

  const candidates = await selectDocuments(prisma);
  console.log(`current embedding model: ${CURRENT_EMBEDDING_MODEL}`);
  console.log(`candidates: ${candidates.length}\n`);

  // Separate out anything we cannot reprocess, so it is reported rather than
  // silently enqueued to fail.
  const runnable = [];
  const unusable = [];

  for (const doc of candidates) {
    if (!doc.storage_key || doc.storage_key === 'PENDING') {
      unusable.push({ ...doc, why: 'no storage key — file was never uploaded' });
      continue;
    }
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: doc.storage_key }));
      runnable.push(doc);
    } catch (err) {
      unusable.push({ ...doc, why: `missing in storage (${err.name || 'error'})` });
    }
  }

  console.table(
    runnable.map((d) => ({
      title: d.title.slice(0, 30),
      status: d.status,
      category: d.category,
      fields: d.fields,
      verified: d.verified,
      chunks: d.chunks,
      reasons: d.reasons.join(','),
    })),
  );

  if (unusable.length > 0) {
    console.log(`\n${unusable.length} document(s) CANNOT be reprocessed:`);
    console.table(unusable.map((d) => ({ title: d.title.slice(0, 30), status: d.status, why: d.why })));

    // A document whose source file is gone can never finish. Left as
    // QUEUED/PROCESSING it shows as perpetually pending in the UI with no
    // explanation, so give it a terminal state and a reason the user can act on.
    const stuckUnusable = unusable.filter(
      (d) => d.status !== 'COMPLETED' && d.status !== 'FAILED',
    );
    if (stuckUnusable.length > 0 && OPTS.failUnusable && !OPTS.dryRun) {
      for (const doc of stuckUnusable) {
        if (doc.version_id) {
          await prisma.documentVersion.update({
            where: { id: doc.version_id },
            data: {
              processingStatus: 'FAILED',
              processingErrorCode: 'SOURCE_FILE_MISSING',
              processingError:
                'The original file is no longer in object storage, so this document cannot be ' +
                'processed. Upload it again.',
              completedAt: new Date(),
            },
          });
        }
        await prisma.document.update({ where: { id: doc.id }, data: { status: 'FAILED' } });
      }
      console.log(`  → marked ${stuckUnusable.length} of them FAILED (--fail-unusable)`);
    } else if (stuckUnusable.length > 0) {
      console.log(
        `  → ${stuckUnusable.length} are still QUEUED/PROCESSING and will never finish. ` +
        `Re-run with --fail-unusable to give them a terminal state.`,
      );
    }
  }

  const totalVerified = runnable.reduce((s, d) => s + d.verified, 0);
  if (totalVerified > 0) {
    console.log(
      `\n${totalVerified} human-verified field(s) across these documents will be PRESERVED.`,
    );
  }

  if (OPTS.dryRun) {
    console.log('\n--dry-run: nothing enqueued.');
    await prisma.$disconnect();
    return;
  }
  if (runnable.length === 0) {
    console.log('\nNothing to do.');
    await prisma.$disconnect();
    return;
  }
  if (!OPTS.yes) {
    console.log(
      `\nRefusing to run without --yes. This will re-run the LLM and embedding ` +
      `calls for ${runnable.length} document(s).`,
    );
    await prisma.$disconnect();
    return;
  }

  const queue = buildQueue();
  const enqueued = [];

  for (const doc of runnable) {
    // Clear the stage history so this is a true reprocess: the pipeline treats
    // a COMPLETED marker as "skip this stage".
    await prisma.documentVersion.update({
      where: { id: doc.version_id },
      data: {
        processingStatus: 'QUEUED',
        processingStage: 'FILE_VALIDATION',
        processingError: null,
        processingErrorCode: null,
        processingErrorStack: null,
        stageHistory: [],
        startedAt: null,
        completedAt: null,
        processingDurationMs: null,
      },
    });
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'QUEUED' } });

    const job = await queue.add(
      'process-document',
      {
        documentId: doc.id,
        versionId: doc.version_id,
        userId: doc.userId,
        storageKey: doc.storage_key,
        mimeType: doc.mimeType,
        requestId: 'reprocess-script',
      },
      { jobId: `reprocess-${doc.id}-${Date.now()}`, attempts: 2 },
    );
    enqueued.push(doc.id);
    console.log(`enqueued ${job.id}  ${doc.title.slice(0, 40)}`);

    // Keep at most OPTS.concurrency jobs un-finished at a time.
    while (true) {
      const [waiting, active] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
      ]);
      if (waiting + active < OPTS.concurrency) break;
      await sleep(2000);
    }
  }

  console.log(`\nenqueued ${enqueued.length} job(s); waiting for completion...`);

  const deadline = Date.now() + OPTS.timeoutMinutes * 60_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT status::text AS status, COUNT(*)::int AS n FROM documents
       WHERE id = ANY($1::text[]) GROUP BY 1`,
      enqueued,
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    const done = (byStatus.COMPLETED ?? 0) + (byStatus.FAILED ?? 0);
    console.log(
      `  ${done}/${enqueued.length} settled  ` +
      Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(' '),
    );
    if (done >= enqueued.length) break;
    await sleep(OPTS.pollSeconds * 1000);
  }

  console.log('\n── result ──');
  console.table(
    await prisma.$queryRawUnsafe(
      `SELECT LEFT(d.title,30) title, d.status::text status, COALESCE(d.category::text,'-') category,
              (SELECT COUNT(*)::int FROM document_fields f WHERE f."documentId"=d.id) fields,
              (SELECT COUNT(*)::int FROM document_chunks c WHERE c."documentId"=d.id) chunks,
              LEFT(COALESCE((SELECT v."processingError" FROM document_versions v
                WHERE v.id=d."currentVersionId"),''),44) error
       FROM documents d WHERE d.id = ANY($1::text[]) ORDER BY d."createdAt"`,
      enqueued,
    ),
  );

  await queue.close();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FAILED:', err.message ?? err);
  process.exit(1);
});
