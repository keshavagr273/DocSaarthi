import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import type { PipelineContext, DocumentProcessingJobData } from './pipeline-context';

type HistoryEntry = {
  stage: string;
  status: string;
  timestamp: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
};

/**
 * BaseStage — abstract base for all pipeline stages.
 *
 * Performance design:
 *  - stageHistory is maintained IN-MEMORY in ctx.stageHistory
 *  - DB writes for stage markers are FIRE-AND-FORGET (non-blocking)
 *  - isAlreadyCompleted reads from memory first, DB only on cold start / retry
 *  - This eliminates 3 blocking DB round-trips per stage (was ~42 total)
 */
export abstract class BaseStage {
  protected abstract readonly stageName: ProcessingStage;
  protected abstract readonly logger: Logger;

  constructor(protected readonly db: DatabaseService) {}

  /**
   * Execute this stage. Mutates ctx in place with results.
   */
  abstract execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void>;

  // ── Stage history helpers ─────────────────────────────────────

  protected markStageProcessing(versionId: string, ctx?: PipelineContext): void {
    const entry: HistoryEntry = {
      stage: this.stageName,
      status: 'PROCESSING',
      timestamp: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    // Update in-memory history first (instant)
    if (ctx) {
      ctx.stageHistory = ctx.stageHistory ?? [];
      // Remove stale PROCESSING entry on retry
      ctx.stageHistory = ctx.stageHistory.filter(
        (h) => !(h.stage === this.stageName && h.status === 'PROCESSING'),
      );
      ctx.stageHistory.push(entry);
    }

    // Fire-and-forget DB write — does not block the pipeline
    this.persistHistory(versionId, entry, ctx).catch(() => {
      // Non-critical: history write failure doesn't fail the pipeline
    });
  }

  protected markStageCompleted(versionId: string, ctx?: PipelineContext): void {
    const entry: HistoryEntry = {
      stage: this.stageName,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    // Update in-memory history
    if (ctx) {
      ctx.stageHistory = ctx.stageHistory ?? [];
      ctx.stageHistory.push(entry);
    }

    // Fire-and-forget DB write
    this.persistHistory(versionId, entry, ctx).catch(() => {});
  }

  protected async markStageFailed(
    versionId: string,
    errorCode?: string,
    errorMessage?: string,
    ctx?: PipelineContext,
  ): Promise<void> {
    const entry: HistoryEntry = {
      stage: this.stageName,
      status: 'FAILED',
      timestamp: new Date().toISOString(),
      ...(errorCode ? { errorCode } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };

    if (ctx) {
      ctx.stageHistory = ctx.stageHistory ?? [];
      ctx.stageHistory.push(entry);
    }

    // Failures are awaited so error state is reliably persisted before throw
    await this.persistHistory(versionId, entry, ctx);
  }

  /**
   * Persist stage history to DB.
   * When ctx is available, we already have the in-memory history and can write
   * it directly without a read-first round-trip.
   * When ctx is not available (legacy call), falls back to read-modify-write.
   */
  private async persistHistory(
    versionId: string,
    entry: HistoryEntry,
    ctx?: PipelineContext,
  ): Promise<void> {
    let historyToWrite: HistoryEntry[];

    if (ctx?.stageHistory) {
      // We already have the full in-memory history — write it directly (no read needed)
      historyToWrite = ctx.stageHistory;
    } else {
      // Cold path: fetch from DB (only happens if ctx not passed, e.g. legacy calls)
      const version = await this.db.documentVersion.findUnique({
        where: { id: versionId },
        select: { stageHistory: true },
      });
      const existing = Array.isArray(version?.stageHistory)
        ? (version.stageHistory as HistoryEntry[])
        : [];
      // Remove stale processing entry on retry
      const filtered = existing.filter(
        (h) => !(h.stage === entry.stage && h.status === 'PROCESSING' && entry.status === 'PROCESSING'),
      );
      filtered.push(entry);
      historyToWrite = filtered;
    }

    await this.db.documentVersion.update({
      where: { id: versionId },
      data: {
        stageHistory: historyToWrite,
        // Also update the current stage field (used for UI)
        ...(entry.status === 'PROCESSING' ? { processingStage: this.stageName } : {}),
      },
    });
  }

  /**
   * Check if this stage is already COMPLETED — used for idempotency on BullMQ retries.
   * Reads from in-memory ctx.stageHistory first; falls back to DB if not populated.
   */
  async isAlreadyCompleted(ctx: PipelineContext): Promise<boolean> {
    // Fast path: check in-memory history (populated during normal runs)
    if (ctx.stageHistory && ctx.stageHistory.length > 0) {
      return ctx.stageHistory.some(
        (h) => h.stage === this.stageName && h.status === 'COMPLETED',
      );
    }

    // Cold path: first stage check on a fresh run, or retry after worker restart
    // Load all history at once and cache it in ctx for subsequent checks
    const version = await this.db.documentVersion.findUnique({
      where: { id: ctx.versionId },
      select: { stageHistory: true },
    });
    const history = Array.isArray(version?.stageHistory)
      ? (version.stageHistory as HistoryEntry[])
      : [];

    // Warm the in-memory cache from DB
    ctx.stageHistory = history;

    return history.some(
      (h) => h.stage === this.stageName && h.status === 'COMPLETED',
    );
  }

  /**
   * Report progress to BullMQ (0-100).
   */
  protected async reportProgress(
    job: Job<DocumentProcessingJobData>,
    pct: number,
  ): Promise<void> {
    await job.progress(Math.min(Math.max(0, pct), 100));
  }
}
