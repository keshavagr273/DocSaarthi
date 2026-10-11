import {
  Processor,
  Process,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Job } from 'bull';
import { DatabaseService, ProcessingStatus, ProcessingStage, DocumentStatus } from '@docsaarthi/database';
import { QUEUES, JOBS } from '@docsaarthi/shared';
import { createPipelineContext, type DocumentProcessingJobData } from './stages/pipeline-context';

// ── Stage imports ───────────────────────────────────────────────────
import { FileValidationStage } from './stages/file-validation.stage';
import { FileStorageStage } from './stages/file-storage.stage';
import { PdfRenderingStage } from './stages/pdf-rendering.stage';
import { ImagePreprocessingStage } from './stages/image-preprocessing.stage';
import { OcrStage } from './stages/ocr.stage';
import { LanguageDetectionStage } from './stages/language-detection.stage';
import { ClassificationStage } from './stages/classification.stage';
import { TextNormalizationStage } from './stages/text-normalization.stage';
import { StructuredExtractionStage } from './stages/structured-extraction.stage';
import { ConfidenceScoringStage } from './stages/confidence-scoring.stage';
import { ValidationStage } from './stages/validation.stage';
import { ChunkingStage } from './stages/chunking.stage';
import { EmbeddingStage } from './stages/embedding.stage';
import { IndexingStage } from './stages/indexing.stage';
import { BaseStage } from './stages/base.stage';
export type { DocumentProcessingJobData };

/**
 * DocumentProcessor — the main BullMQ processor for the document pipeline.
 *
 * Runs all 14 real processing stages in sequence.
 * Each stage is idempotent: on BullMQ retry, completed stages are skipped.
 *
 * Merged into the API process to avoid the need for a separate worker service.
 */
@Processor(QUEUES.DOCUMENT_PROCESSING)
export class DocumentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly fileValidationStage: FileValidationStage,
    private readonly fileStorageStage: FileStorageStage,
    private readonly pdfRenderingStage: PdfRenderingStage,
    private readonly imagePreprocessingStage: ImagePreprocessingStage,
    private readonly ocrStage: OcrStage,
    private readonly languageDetectionStage: LanguageDetectionStage,
    private readonly classificationStage: ClassificationStage,
    private readonly textNormalizationStage: TextNormalizationStage,
    private readonly structuredExtractionStage: StructuredExtractionStage,
    private readonly confidenceScoringStage: ConfidenceScoringStage,
    private readonly validationStage: ValidationStage,
    private readonly chunkingStage: ChunkingStage,
    private readonly embeddingStage: EmbeddingStage,
    private readonly indexingStage: IndexingStage,
  ) {}

  onModuleInit(): void {
    // DB poller disabled: BullMQ handles queue persistence and retries.
    // Running processDocumentJob directly bypasses queue concurrency controls.
  }

  onModuleDestroy(): void {
    // No-op
  }



  // ── Job lifecycle hooks ──────────────────────────────────────────

  @OnQueueActive()
  onActive(job: Job<DocumentProcessingJobData>): void {
    this.logger.log(
      `[Job ${job.id}] STARTED — document=${job.data.documentId} attempt=${job.attemptsMade + 1}`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<DocumentProcessingJobData>): void {
    this.logger.log(`[Job ${job.id}] COMPLETED — document=${job.data.documentId}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<DocumentProcessingJobData>, err: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    this.logger.error(
      `[Job ${job.id}] FAILED — document=${job.data.documentId} ` +
      `attempt=${job.attemptsMade}/${maxAttempts} error=${err.message}`,
      err.stack,
    );

    // Bull increments attemptsMade before emitting 'failed', so attemptsMade
    // already counts this attempt. The previous `>= attempts - 1` comparison
    // marked the document FAILED one attempt early, before the final retry had
    // even run — so a document that would have succeeded on retry was shown to
    // the user as failed.
    if (job.attemptsMade >= maxAttempts) {
      await this.markDocumentFailed(job.data, err);
    } else {
      this.logger.log(
        `[Job ${job.id}] will be retried (${job.attemptsMade}/${maxAttempts} attempts used)`,
      );
    }
  }

  // ── Main processor ───────────────────────────────────────────────

  @Process(JOBS.PROCESS_DOCUMENT)
  async handleDocumentProcessingNamed(
    job: Job<DocumentProcessingJobData>,
  ): Promise<{ success: boolean; documentId: string }> {
    return this.processDocumentJob(job);
  }

  @Process()
  async handleDocumentProcessingDefault(
    job: Job<DocumentProcessingJobData>,
  ): Promise<{ success: boolean; documentId: string }> {
    return this.processDocumentJob(job);
  }

  private async processDocumentJob(
    job: Job<DocumentProcessingJobData>,
  ): Promise<{ success: boolean; documentId: string }> {
    const { documentId, versionId } = job.data;

    this.logger.log(
      `Processing document=${documentId} version=${versionId} mime=${job.data.mimeType}`,
    );

    try {
      // ── Mark as processing ──────────────────────────────────────
      await this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.PROCESSING },
      });
      await this.db.documentVersion.update({
        where: { id: versionId },
        data: {
          processingStatus: ProcessingStatus.PROCESSING,
          startedAt: new Date(),
        },
      });
      await this.db.processingJob.updateMany({
        where: { documentId, versionId },
        data: { status: ProcessingStatus.PROCESSING, startedAt: new Date() },
      });

      // ── Build pipeline ──────────────────────────────────────────
      const ctx = createPipelineContext(job.data, job);

      const pipeline: BaseStage[] = [
        this.fileValidationStage,
        this.fileStorageStage,
        this.pdfRenderingStage,
        this.imagePreprocessingStage,
        this.ocrStage,
        this.languageDetectionStage,
        this.classificationStage,
        this.textNormalizationStage,
        this.structuredExtractionStage,
        this.confidenceScoringStage,
        this.validationStage,
        this.chunkingStage,
        this.embeddingStage,
        this.indexingStage,
      ];

      const stageTimes: Array<{ name: string; durationMs: number }> = [];
      const pipelineStart = Date.now();
      const totalStages = pipeline.length;

      // ── Execute each stage ──────────────────────────────────────
      for (let i = 0; i < pipeline.length; i++) {
        const stage = pipeline[i]!;

        const stageLabel = stage.name;

        // Idempotency: skip stages already completed on a prior attempt
        const alreadyDone = await stage.isAlreadyCompleted(ctx);
        if (alreadyDone) {
          this.logger.debug(
            `[${documentId}] Skipping already-completed stage ${i + 1}/${totalStages} (${stageLabel})`,
          );

          // ── Context rehydration from DB ─────────────────────────
          // A skipped stage left nothing in memory, so each stage restores its
          // own persisted output. Stages run in order, so a stage's rehydrate()
          // can rely on earlier stages' ctx fields already being present.
          await stage.rehydrate(ctx);

          continue;
        }

        this.logger.log(`\n${'─'.repeat(60)}\n▶ [${i + 1}/${totalStages}] ${stageLabel} — STARTING\n${'─'.repeat(60)}`);

        const t0 = Date.now();
        await stage.execute(ctx, job);
        const durationMs = Date.now() - t0;

        stageTimes.push({ name: stageLabel, durationMs });

        // ASCII bar: each █ = 500ms, max 20 blocks
        const bars = Math.min(20, Math.round(durationMs / 500));
        const bar = bars > 0 ? '█'.repeat(bars) : '▏';
        this.logger.log(`✅ [${i + 1}/${totalStages}] ${stageLabel} — ${durationMs}ms  ${bar}`);
      }

      // ── Mark as COMPLETED ───────────────────────────────────────
      // Stage markers are written fire-and-forget for speed. Let them settle
      // before the COMPLETED write below, otherwise a late marker can land
      // afterwards and overwrite processingStage back to an earlier stage.
      await BaseStage.flushHistory(ctx);

      const now = new Date();
      const version = await this.db.documentVersion.findUnique({
        where: { id: versionId },
        select: { startedAt: true },
      });
      const durationMs = version?.startedAt
        ? now.getTime() - version.startedAt.getTime()
        : null;

      await Promise.all([
        this.db.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.COMPLETED },
        }),
        this.db.documentVersion.update({
          where: { id: versionId },
          data: {
            processingStatus: ProcessingStatus.COMPLETED,
            processingStage: ProcessingStage.COMPLETED,
            completedAt: now,
            processingDurationMs: durationMs ?? undefined,
          },
        }),
        this.db.processingJob.updateMany({
          where: { documentId, versionId },
          data: {
            status: ProcessingStatus.COMPLETED,
            currentStage: ProcessingStage.COMPLETED,
            completedAt: now,
          },
        }),
      ]);

      await job.progress(100);

      // ── Pipeline Summary Table ──────────────────────────────────
      const totalPipelineMs = Date.now() - pipelineStart;
      const maxDur = Math.max(...stageTimes.map((s) => s.durationMs), 1);
      const nameColWidth = Math.max(...stageTimes.map((s) => s.name.length), 20);
      const divider = '─'.repeat(nameColWidth + 32);

      this.logger.log(`\n${'═'.repeat(nameColWidth + 32)}`);
      this.logger.log(`  📊 PIPELINE SUMMARY — document=${documentId}`);
      this.logger.log(`${'═'.repeat(nameColWidth + 32)}`);
      this.logger.log(`  ${'STAGE'.padEnd(nameColWidth)}  ${'TIME (ms)'.padStart(9)}  BAR`);
      this.logger.log(`  ${divider}`);

      for (const { name, durationMs: dur } of stageTimes) {
        const bars = Math.max(1, Math.round((dur / maxDur) * 20));
        const bar = '█'.repeat(bars);
        const warning = dur > 5000 ? ' ⚠️  SLOW' : dur > 2000 ? ' 🐢' : '';
        this.logger.log(`  ${name.padEnd(nameColWidth)}  ${String(dur).padStart(9)}ms  ${bar}${warning}`);
      }

      this.logger.log(`  ${divider}`);
      this.logger.log(`  ${'TOTAL'.padEnd(nameColWidth)}  ${String(totalPipelineMs).padStart(9)}ms`);
      this.logger.log(`${'═'.repeat(nameColWidth + 32)}\n`);

      this.logger.log(
        `✅ Document processing COMPLETE: document=${documentId} duration=${durationMs}ms`,
      );

      return { success: true, documentId };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Processing failed for document=${documentId}: ${error.message}`,
        error.stack,
      );
      throw error; // BullMQ will handle retry
    }
  }

  // ── Failure handler ──────────────────────────────────────────────

  private async markDocumentFailed(
    data: DocumentProcessingJobData,
    error: Error,
  ): Promise<void> {
    const { documentId, versionId } = data;
    const now = new Date();

    // updateMany (not update) so a document or version that was deleted while
    // the job was in flight does not throw P2025 out of the 'failed' event
    // handler, where nothing would catch it. Each write is independent: one
    // failing must not stop the others from recording the error.
    const writes: Array<[string, Promise<unknown>]> = [
      [
        'document',
        this.db.document.updateMany({
          where: { id: documentId },
          data: { status: DocumentStatus.FAILED },
        }),
      ],
      [
        'documentVersion',
        this.db.documentVersion.updateMany({
          where: { id: versionId },
          data: {
            processingStatus: ProcessingStatus.FAILED,
            processingError: error.message.slice(0, 2000),
            processingErrorStack: error.stack,
            completedAt: now,
          },
        }),
      ],
      [
        'processingJob',
        this.db.processingJob.updateMany({
          where: { documentId, versionId },
          data: {
            status: ProcessingStatus.FAILED,
            errorMessage: error.message.slice(0, 2000),
            errorStack: error.stack,
            completedAt: now,
          },
        }),
      ],
    ];

    const results = await Promise.allSettled(writes.map(([, p]) => p));
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Could not record failure state on ${writes[idx]![0]} for document=${documentId}: ${String(result.reason)}`,
        );
      }
    });
  }
}
