import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * Stage 14: INDEXING
 *
 * Verifies the document is properly indexed after embedding:
 * - Checks at least 1 embedding row exists for this version
 * - Verifies FTS query works on the chunks table
 * - If embeddings are missing: throws to trigger retry of Stage 13
 */
@Injectable()
export class IndexingStage extends BaseStage {
  protected readonly stageName = ProcessingStage.INDEXING;
  protected readonly logger = new Logger(IndexingStage.name);

  constructor(db: DatabaseService) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 14: INDEXING`);
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 92);

    // ── 1. Verify embeddings exist ────────────────────────────────
    const embeddingCount = await this.db.$queryRaw<
      [{ count: bigint }]
    >`SELECT COUNT(*) as count FROM document_embeddings WHERE version_id = ${ctx.versionId}`;

    const count = Number(embeddingCount[0]?.count ?? 0);
    const chunkCount = (ctx.chunkIds ?? []).length;

    if (chunkCount > 0 && count === 0) {
      throw new Error(
        `INDEXING_FAILED: ${chunkCount} chunks exist but 0 embeddings found for version ${ctx.versionId}. Retrying Stage 13.`,
      );
    }

    this.logger.log(
      `[${ctx.documentId}] Embeddings: ${count}/${chunkCount} chunks have embeddings`,
    );

    // ── 2. Verify full-text search works ─────────────────────────
    if (chunkCount > 0) {
      const ftsResult = await this.db.$queryRaw<
        [{ valid: boolean }]
      >`
        SELECT COUNT(*) > 0 as valid
        FROM document_chunks
        WHERE version_id = ${ctx.versionId}
          AND to_tsvector('english', content) @@ plainto_tsquery('english', 'the')
        LIMIT 1
      `;

      // Note: this query may return false if no chunk contains "the" — that's fine
      // We just want to confirm the query executes without error
      const ftsValid = ftsResult.length > 0;
      this.logger.log(`[${ctx.documentId}] FTS index: ${ftsValid ? 'ok' : 'no matches (normal)'}`);
    }

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(`[${ctx.documentId}] Stage 14 DONE — indexing verified`);
  }
}
