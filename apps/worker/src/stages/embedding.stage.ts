import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import type { Job } from 'bull';

import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { LlmService } from '../services/llm.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

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
    sharedRedisClient = new Redis(redisUrl);
    sharedRedisClient.on('error', () => {
      sharedRedisClient = null;
    });
    return sharedRedisClient;
  } catch {
    return null;
  }
}

/**
 * Stage 13: EMBEDDING
 *
 * Generates OpenAI text-embedding-3-small embeddings for all document chunks.
 * Uses Redis cache keyed by SHA-256 of content to avoid re-computing identical text.
 * Stores embeddings via raw SQL (Prisma doesn't support pgvector natively).
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

    // Delete existing embeddings (idempotency)
    await this.db.$executeRaw`
      DELETE FROM document_embeddings WHERE "versionId" = ${ctx.versionId}
    `;

    // Use the shared Redis singleton — no per-job connect/disconnect overhead
    const redis = getSharedRedis();

    const allEmbeddings: Float32Array[] = [];

    // Process in batches
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const batchIds = chunkIds.slice(i, i + EMBEDDING_BATCH_SIZE);

      const textsToEmbed: string[] = [];
      const cachedEmbeddings: Map<number, Float32Array> = new Map();

      // Check cache
      for (let j = 0; j < batchChunks.length; j++) {
        const content = batchChunks[j]!.content;
        const cacheKey = this.getCacheKey(content);
        const cached = await this.getCached(redis, cacheKey);
        if (cached) {
          cachedEmbeddings.set(j, cached);
        } else {
          textsToEmbed.push(content);
        }
      }

      // Generate embeddings for non-cached texts
      let generatedEmbeddings: Float32Array[] = [];
      if (textsToEmbed.length > 0) {
        generatedEmbeddings = await this.llm.embedBatch(textsToEmbed);
      }

      // Merge cached + generated and store
      let genIdx = 0;
      for (let j = 0; j < batchChunks.length; j++) {
        const chunkId = batchIds[j]!;
        const content = batchChunks[j]!.content;

        let embedding: Float32Array;
        if (cachedEmbeddings.has(j)) {
          embedding = cachedEmbeddings.get(j)!;
        } else {
          embedding = generatedEmbeddings[genIdx++]!;
          // Cache for future use
          const cacheKey = this.getCacheKey(content);
          await this.setCached(redis, cacheKey, embedding);
        }

        allEmbeddings.push(embedding);

        // Store in DB via raw SQL (pgvector requires this)
        const vectorStr = `[${Array.from(embedding).join(',')}]`;
        await this.db.$executeRaw`
          INSERT INTO document_embeddings (id, "chunkId", "documentId", "versionId", model, dimension, embedding, "createdAt")
          VALUES (
            gen_random_uuid()::text,
            ${chunkId},
            ${ctx.documentId},
            ${ctx.versionId},
            ${'text-embedding-3-small'},
            ${1536},
            ${vectorStr}::vector,
            NOW()
          )
          ON CONFLICT DO NOTHING
        `;
      }

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
      `batches=${batchCount} | model=text-embedding-3-small | dim=1536 | redisConnected=${!!redis}`,
    );
    this.logger.debug(
      `[${ctx.documentId}] Stage 13 DETAILS:\n` +
      `  totalChunks     : ${chunks.length}\n` +
      `  embeddingsStored: ${allEmbeddings.length}\n` +
      `  batchSize       : ${EMBEDDING_BATCH_SIZE}\n` +
      `  batchCount      : ${batchCount}\n` +
      `  embeddingModel  : text-embedding-3-small (dim 1536)\n` +
      `  redisCacheActive: ${!!redis}`,
    );
  }

  // ── Redis cache helpers ───────────────────────────────────────────

  private getCacheKey(content: string): string {
    const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    return `docsaarthi:embed:${hash}`;
  }

  private async getCached(redis: Redis | null, key: string): Promise<Float32Array | null> {
    try {
      if (!redis) return null;
      const value = await redis.get(key);
      if (!value) return null;
      const arr = JSON.parse(value) as number[];
      return new Float32Array(arr);
    } catch {
      return null;
    }
  }

  private async setCached(redis: Redis | null, key: string, embedding: Float32Array): Promise<void> {
    try {
      if (!redis) return;
      const value = JSON.stringify(Array.from(embedding));
      await redis.set(key, value, 'EX', EMBEDDING_CACHE_TTL_SECONDS);
    } catch {
      // Cache miss is acceptable
    }
  }
}
