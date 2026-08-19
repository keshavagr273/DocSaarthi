import {
  Processor,
  Process,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DatabaseService, ProcessingStatus, ProcessingStage, DocumentStatus } from '@docsaarthi/database';
import { QUEUES, JOBS } from '@docsaarthi/shared';
import { createPipelineContext } from '../stages/pipeline-context';

// ── Stage imports ───────────────────────────────────────────────────
import { FileValidationStage } from '../stages/file-validation.stage';
import { FileStorageStage } from '../stages/file-storage.stage';
import { PdfRenderingStage } from '../stages/pdf-rendering.stage';
import { ImagePreprocessingStage } from '../stages/image-preprocessing.stage';
import { OcrStage } from '../stages/ocr.stage';
import { LanguageDetectionStage } from '../stages/language-detection.stage';
import { ClassificationStage } from '../stages/classification.stage';
import { TextNormalizationStage } from '../stages/text-normalization.stage';
import { StructuredExtractionStage } from '../stages/structured-extraction.stage';
import { ConfidenceScoringStage } from '../stages/confidence-scoring.stage';
import { ValidationStage } from '../stages/validation.stage';
import { ChunkingStage } from '../stages/chunking.stage';
import { EmbeddingStage } from '../stages/embedding.stage';
import { IndexingStage } from '../stages/indexing.stage';
import type { BaseStage } from '../stages/base.stage';

export interface DocumentProcessingJobData {
  documentId: string;
  versionId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
  requestId?: string;
}

/**
 * DocumentProcessor — the main BullMQ processor for the document pipeline.
 *
 * Checkpoint 2: runs all 14 real processing stages in sequence.
 * Each stage is idempotent: on BullMQ retry, completed stages are skipped.
 */
@Processor(QUEUES.DOCUMENT_PROCESSING)
export class DocumentProcessor {
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
    this.logger.error(
      `[Job ${job.id}] FAILED — document=${job.data.documentId} error=${err.message}`,
      err.stack,
    );

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;
    if (isLastAttempt) {
      await this.markDocumentFailed(job.data, err);
    }
  }

  // ── Main processor ───────────────────────────────────────────────

  @Process(JOBS.PROCESS_DOCUMENT)
  async handleDocumentProcessing(
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

      const totalStages = pipeline.length;

      // ── Execute each stage ──────────────────────────────────────
      for (let i = 0; i < pipeline.length; i++) {
        const stage = pipeline[i]!;

        // Idempotency: skip stages already completed on a prior attempt
        const alreadyDone = await stage.isAlreadyCompleted(ctx);
        if (alreadyDone) {
          this.logger.debug(
            `[${documentId}] Skipping already-completed stage ${i + 1}/${totalStages}`,
          );
          continue;
        }

        await stage.execute(ctx, job);
      }

      // ── Mark as COMPLETED ───────────────────────────────────────
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

    await Promise.all([
      this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED },
      }),
      this.db.documentVersion.update({
        where: { id: versionId },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          processingError: error.message,
          processingErrorStack: error.stack,
          completedAt: now,
        },
      }),
      this.db.processingJob.updateMany({
        where: { documentId, versionId },
        data: {
          status: ProcessingStatus.FAILED,
          errorMessage: error.message,
          errorStack: error.stack,
          completedAt: now,
        },
      }),
    ]);
  }
}
