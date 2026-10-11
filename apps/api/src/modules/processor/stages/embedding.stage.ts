import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import type { Job } from 'bull';

import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { LlmService } from '../services/llm.service';
import type { PipelineContext, DocumentProcessingJobData } from './pipeline-context';

const EMBEDDING_BATCH_SIZE = 50; // OpenAI allows up to 2048 inputs, but keep batches small
const EMBEDDING_CACHE_TTL_SECONDS = 86400; // 24 hours

/**
 * Module-level Redis singleton for embedding cache.
 * Created lazily on first use and reused across all document processing jobs,
 * avoiding the ~200-300ms cold-connection overhead per document.
 */
let sharedRedisClient: Redis | null = null;

function getSharedRedis(): Redis | null {
  if (sharedRedisClient) return sharedRedisClient;
  try {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const isTls = redisUrl.startsWith('rediss://');
    const client = new Redis(redisUrl, {
      // The embedding cache is strictly optional — never let it block the
      // pipeline or retry forever.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    });
    client.on('error', () => {
      // Drop AND close the broken client so the next job builds a fresh one.
      // Previously the handle was leaked here, leaving an orphan socket
      // reconnecting forever for every failure.
      if (sharedRedisClient === client) {
        sharedRedisClient = null;
        void client.quit().catch(() => client.disconnect());
      }
    });
    sharedRedisClient = client;
    return sharedRedisClient;
  } catch {
    return null;
  }
}

/**
 * The pgvector column cannot be expressed in the Prisma schema, so it is
 * created by prisma/sql/001_vector_and_search_indexes.sql. A deployment that
 * skips that script would otherwise fail here with "column embedding does not
 * exist" on every single document, so we verify (and repair) it once per
 * process before the first insert.
 */
let vectorSchemaCheck: Promise<void> | null = null;

/**
 * Stage 13: EMBEDDING
 *
 * Generates embeddings for all document chunks via LlmService.
 * Uses a Redis cache keyed by model + SHA-256 of content to avoid re-computing
 * identical text. Stores vectors via raw SQL (Prisma has no pgvector support).
 */
@Injectable()
export class EmbeddingStage extends BaseStage {
  protected readonly stageName = ProcessingStage.EMBEDDING;
  protected readonly logger = new Logger(EmbeddingStage.name);

  constructor(
    db: DatabaseService,
    private readonly llm: LlmService,
  ) {
    super(db);
  }

  /**
   * ctx.embeddings is not read by any later stage (INDEXING counts rows in the
   * DB), so a skipped EMBEDDING stage needs nothing restored.
   */
  async rehydrate(): Promise<void> {
    // no-op
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 13: EMBEDDING`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 84);

    const chunkIds = ctx.chunkIds ?? [];
    const chunks = ctx.chunks ?? [];

    if (chunkIds.length === 0) {
      this.logger.warn(`[${ctx.documentId}] No chunks to embed`);
      ctx.embeddings = [];
      this.markStageCompleted(ctx.versionId, ctx);
      return;
    }

    if (chunkIds.length !== chunks.length) {
      // chunkIds and chunks are positionally paired; a mismatch would silently
      // attach every embedding to the wrong chunk.
      throw new Error(
        `EMBEDDING_CONTEXT_MISMATCH: ${chunks.length} chunks but ${chunkIds.length} chunk IDs for version ${ctx.versionId}`,
      );
    }

    await this.ensureVectorSchema();

    // Delete existing embeddings (idempotency)
    await this.db.$executeRaw`
      DELETE FROM document_embeddings WHERE "versionId" = ${ctx.versionId}
    `;

    // Use the shared Redis singleton — no per-job connect/disconnect overhead
    const redis = getSharedRedis();

    const allEmbeddings: Float32Array[] = [];
    const modelName = this.llm.getEmbeddingModel();
    const dimension = this.llm.getEmbeddingDimension();
    let cacheHits = 0;

    // The model recorded on the rows. Starts as the configured model and is
    // replaced by whatever actually produced the vectors.
    let storedModel = modelName;
    let usedFallback = false;

    // Process in batches
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const batchIds = chunkIds.slice(i, i + EMBEDDING_BATCH_SIZE);

      // ── Check cache (one round-trip for the whole batch) ────────
      const cacheKeys = batchChunks.map((c) => this.getCacheKey(c.content, modelName));
      const cached = await this.getCachedMany(redis, cacheKeys, dimension);

      const textsToEmbed: string[] = [];
      const missingIndexes: number[] = [];
      for (let j = 0; j < batchChunks.length; j++) {
        if (cached[j]) {
          cacheHits++;
        } else {
          textsToEmbed.push(batchChunks[j]!.content);
          missingIndexes.push(j);
        }
      }

      // ── Generate embeddings for non-cached texts ────────────────
      let generatedEmbeddings: Float32Array[] = [];
      if (textsToEmbed.length > 0) {
        const result = await this.llm.embedBatchDetailed(textsToEmbed);
        generatedEmbeddings = result.vectors;

        // Record the model that actually produced the vectors. On a provider
        // outage this is the local hash fallback, whose output is comparable
        // only to itself — storing it under the real model's name made broken
        // search results impossible to diagnose.
        if (result.model !== storedModel) {
          storedModel = result.model;
        }
        if (result.isFallback) usedFallback = true;

        if (generatedEmbeddings.length !== textsToEmbed.length) {
          // Previously a short response produced `undefined` entries that blew
          // up later inside Array.from() with an opaque error.
          throw new Error(
            `EMBEDDING_COUNT_MISMATCH: requested ${textsToEmbed.length} embeddings but provider "${result.model}" returned ${generatedEmbeddings.length}`,
          );
        }
      }

      // ── Merge cached + generated, then persist ──────────────────
      for (let g = 0; g < missingIndexes.length; g++) {
        const j = missingIndexes[g]!;
        const embedding = generatedEmbeddings[g]!;
        cached[j] = embedding;
        // Cache for future use (best-effort)
        await this.setCached(redis, cacheKeys[j]!, embedding);
      }

      const rows: Array<{ chunkId: string; vectorStr: string }> = [];
      for (let j = 0; j < batchChunks.length; j++) {
        const embedding = cached[j]!;

        if (embedding.length !== dimension) {
          throw new Error(
            `EMBEDDING_DIMENSION_MISMATCH: expected ${dimension} dims (pgvector column width) ` +
            `but got ${embedding.length} from "${storedModel}". Check EMBEDDING_DIMENSION.`,
          );
        }

        allEmbeddings.push(embedding);
        rows.push({
          chunkId: batchIds[j]!,
          vectorStr: `[${Array.from(embedding).join(',')}]`,
        });
      }

      await this.insertEmbeddingRows(ctx, rows, storedModel, dimension);

      await this.reportProgress(
        job,
        84 + Math.round(((i + batchChunks.length) / chunks.length) * 6),
      );
    }

    ctx.embeddings = allEmbeddings;

    this.markStageCompleted(ctx.versionId, ctx);
    const batchCount = Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE);
    this.logger.log(
      `[${ctx.documentId}] Stage 13 DONE — embedded ${allEmbeddings.length} chunks | ` +
      `batches=${batchCount} | cacheHits=${cacheHits} | model=${storedModel} | dim=${dimension} | redisConnected=${!!redis}`,
    );

    if (usedFallback) {
      this.logger.error(
        `[${ctx.documentId}] Stage 13 used NON-SEMANTIC fallback embeddings (model=${storedModel}). ` +
        'Semantic search will not find this document until it is re-embedded with a working provider.',
      );
    }
    this.logger.debug(
      `[${ctx.documentId}] Stage 13 DETAILS:\n` +
      `  totalChunks     : ${chunks.length}\n` +
      `  embeddingsStored: ${allEmbeddings.length}\n` +
      `  cacheHits       : ${cacheHits}\n` +
      `  batchSize       : ${EMBEDDING_BATCH_SIZE}\n` +
      `  batchCount      : ${batchCount}\n` +
      `  embeddingModel  : ${modelName} (dim ${dimension})\n` +
      `  redisCacheActive: ${!!redis}`,
    );
  }

  // ── Persistence ───────────────────────────────────────────────────

  /**
   * Insert a batch of vectors in a single statement. Prisma's tagged-template
   * $executeRaw cannot build a variable-length VALUES list, so the placeholder
   * list is assembled by hand — every value is still bound as a parameter, so
   * no text is interpolated into the SQL.
   */
  private async insertEmbeddingRows(
    ctx: PipelineContext,
    rows: Array<{ chunkId: string; vectorStr: string }>,
    modelName: string,
    dimension: number,
  ): Promise<void> {
    if (rows.length === 0) return;

    const params: unknown[] = [];
    const valueClauses: string[] = [];

    for (const row of rows) {
      const base = params.length;
      valueClauses.push(
        `(gen_random_uuid()::text, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::vector, NOW())`,
      );
      params.push(row.chunkId, ctx.documentId, ctx.versionId, modelName, dimension, row.vectorStr);
    }

    const sql =
      'INSERT INTO document_embeddings ' +
      '(id, "chunkId", "documentId", "versionId", model, dimension, embedding, "createdAt") VALUES ' +
      valueClauses.join(', ') +
      ' ON CONFLICT ("chunkId") DO UPDATE SET ' +
      'embedding = EXCLUDED.embedding, model = EXCLUDED.model, dimension = EXCLUDED.dimension';

    await this.db.$executeRawUnsafe(sql, ...params);
  }

  /**
   * Verify the pgvector column exists, creating it plus its indexes if not.
   * Runs at most once per process. Idempotent.
   */
  private async ensureVectorSchema(): Promise<void> {
    if (!vectorSchemaCheck) {
      vectorSchemaCheck = this.runVectorSchemaCheck().catch((err) => {
        // Allow a later job to retry rather than caching the failure forever.
        vectorSchemaCheck = null;
        throw err;
      });
    }
    return vectorSchemaCheck;
  }

  private async runVectorSchemaCheck(): Promise<void> {
    const dimension = this.llm.getEmbeddingDimension();

    const existing = await this.db.$queryRaw<Array<{ udt_name: string }>>`
      SELECT udt_name
      FROM information_schema.columns
      WHERE table_name = 'document_embeddings' AND column_name = 'embedding'
    `;

    if (existing.length > 0) {
      this.logger.debug(`pgvector column present (udt=${existing[0]?.udt_name})`);
      return;
    }

    this.logger.warn(
      'document_embeddings.embedding is missing — applying the pgvector schema now. ' +
      'Add "npm run db:setup-search" to your deploy step to avoid this.',
    );

    try {
      await this.db.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
      await this.db.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      await this.db.$executeRawUnsafe(
        `ALTER TABLE document_embeddings ADD COLUMN IF NOT EXISTS embedding vector(${dimension})`,
      );
      await this.db.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "document_embeddings_chunkId_key" ON document_embeddings ("chunkId")',
      );
      await this.db.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS document_embeddings_embedding_hnsw_idx ' +
        'ON document_embeddings USING hnsw (embedding vector_cosine_ops)',
      );
      await this.db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS document_chunks_content_fts_idx ` +
        `ON document_chunks USING gin (to_tsvector('english', content))`,
      );
      await this.db.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS document_chunks_content_trgm_idx ' +
        'ON document_chunks USING gin (content gin_trgm_ops)',
      );
      this.logger.log(`pgvector schema applied — vector(${dimension}) + HNSW + FTS/trigram indexes`);
    } catch (err) {
      throw new Error(
        'VECTOR_SCHEMA_MISSING: document_embeddings.embedding does not exist and could not be ' +
        `created (${String(err)}). Run "npm run db:setup-search" against your database.`,
      );
    }
  }

  // ── Redis cache helpers ───────────────────────────────────────────

  /**
   * The key includes the model name — two providers produce incompatible
   * vectors for the same text, so they must never share a cache entry.
   */
  private getCacheKey(content: string, model: string): string {
    const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    return `docsaarthi:embed:${model}:${hash}`;
  }

  private async getCachedMany(
    redis: Redis | null,
    keys: string[],
    dimension: number,
  ): Promise<Array<Float32Array | null>> {
    const empty: Array<Float32Array | null> = keys.map(() => null);
    if (!redis || keys.length === 0) return empty;

    try {
      const values = await redis.mget(...keys);
      return values.map((value) => {
        if (!value) return null;
        try {
          const arr = JSON.parse(value) as number[];
          // Reject stale entries written under a different dimension.
          if (!Array.isArray(arr) || arr.length !== dimension) return null;
          return new Float32Array(arr);
        } catch {
          return null;
        }
      });
    } catch {
      return empty;
    }
  }

  private async setCached(redis: Redis | null, key: string, embedding: Float32Array): Promise<void> {
    try {
      if (!redis) return;
      const value = JSON.stringify(Array.from(embedding));
      await redis.set(key, value, 'EX', EMBEDDING_CACHE_TTL_SECONDS);
    } catch {
      // Cache write failure is acceptable
    }
  }
}
