import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * BaseStage — abstract base for all pipeline stages.
 *
 * Each stage:
 *  1. Calls updateStageStatus PROCESSING at entry
 *  2. Does its work and mutates ctx
 *  3. Calls updateStageStatus COMPLETED at exit
 *  4. On error: lets it bubble up (BullMQ handles retries)
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

  protected async markStageProcessing(versionId: string): Promise<void> {
    await this.db.documentVersion.update({
      where: { id: versionId },
      data: { processingStage: this.stageName },
    });
    await this.appendHistory(versionId, 'PROCESSING');
  }

  protected async markStageCompleted(versionId: string): Promise<void> {
    await this.appendHistory(versionId, 'COMPLETED');
  }

  protected async markStageFailed(
    versionId: string,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.appendHistory(versionId, 'FAILED', errorCode, errorMessage);
  }

  private async appendHistory(
    versionId: string,
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    const version = await this.db.documentVersion.findUnique({
      where: { id: versionId },
      select: { stageHistory: true },
    });

    const history = Array.isArray(version?.stageHistory) ? version.stageHistory : [];

    type HistoryEntry = {
      stage: string;
      status: string;
      timestamp: string;
      errorCode?: string;
      errorMessage?: string;
      startedAt?: string;
      completedAt?: string;
    };

    const existing = history as HistoryEntry[];

    // Remove any prior PROCESSING entry for this stage on retry
    const filtered = existing.filter(
      (h) => !(h.stage === this.stageName && h.status === 'PROCESSING'),
    );

    const entry: HistoryEntry = {
      stage: this.stageName,
      status,
      timestamp: new Date().toISOString(),
      ...(status === 'PROCESSING' ? { startedAt: new Date().toISOString() } : {}),
      ...(status === 'COMPLETED' ? { completedAt: new Date().toISOString() } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };

    filtered.push(entry);

    await this.db.documentVersion.update({
      where: { id: versionId },
      data: { stageHistory: filtered },
    });
  }

  /**
   * Check if this stage is already COMPLETED in stageHistory (idempotency for retries).
   */
  async isAlreadyCompleted(ctx: PipelineContext): Promise<boolean> {
    const version = await this.db.documentVersion.findUnique({
      where: { id: ctx.versionId },
      select: { stageHistory: true },
    });

    const history = Array.isArray(version?.stageHistory) ? version.stageHistory : [];
    type Entry = { stage: string; status: string };
    return (history as Entry[]).some(
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
