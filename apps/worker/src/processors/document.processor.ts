import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DatabaseService, ProcessingStatus, ProcessingStage, DocumentStatus } from '@docsaarthi/database';
import { QUEUES, JOBS } from '@docsaarthi/shared';

export interface DocumentProcessingJobData {
  documentId: string;
  versionId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
  requestId?: string;
}

/**
 * Document Processing Worker
 *
 * This processor handles all stages of document processing in Checkpoint 1.
 * In Checkpoint 1, we scaffold the job lifecycle and update processing status.
 * The actual OCR, classification, and extraction stages are added in Checkpoint 2.
 */
@Processor(QUEUES.DOCUMENT_PROCESSING)
export class DocumentProcessor {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(private readonly db: DatabaseService) {}

  // ── Job lifecycle hooks ──────────────────────────────────────

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
      await this.markDocumentFailed(
        job.data.documentId,
        job.data.versionId,
        err.message,
        err.stack,
      );
    }
  }

  // ── Main processor ───────────────────────────────────────────

  @Process(JOBS.PROCESS_DOCUMENT)
  async handleDocumentProcessing(
    job: Job<DocumentProcessingJobData>,
  ): Promise<{ success: boolean }> {
    const { documentId, versionId, userId: _userId, storageKey: _storageKey, mimeType } = job.data;

    this.logger.log(
      `Processing document=${documentId} version=${versionId} mime=${mimeType}`,
    );

    try {
      // Mark as processing
      await this.updateVersionStatus(versionId, ProcessingStatus.PROCESSING, ProcessingStage.FILE_VALIDATION);
      await this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.PROCESSING },
      });
      await this.updateProcessingJob(documentId, versionId, ProcessingStatus.PROCESSING, ProcessingStage.FILE_VALIDATION);

      // ────────────────────────────────────────────────────────
      // CHECKPOINT 1: Scaffold only
      // In Checkpoint 2, we will add real processing logic here.
      // Each stage below logs progress and simulates the work.
      // ────────────────────────────────────────────────────────

      const stages: Array<{ stage: ProcessingStage; label: string }> = [
        { stage: ProcessingStage.FILE_VALIDATION, label: 'Validating file' },
        { stage: ProcessingStage.FILE_STORAGE, label: 'Storing file metadata' },
        { stage: ProcessingStage.PDF_RENDERING, label: 'Rendering pages' },
        { stage: ProcessingStage.IMAGE_PREPROCESSING, label: 'Preprocessing images' },
        { stage: ProcessingStage.OCR, label: 'Running OCR' },
        { stage: ProcessingStage.LANGUAGE_DETECTION, label: 'Detecting language' },
        { stage: ProcessingStage.DOCUMENT_CLASSIFICATION, label: 'Classifying document' },
        { stage: ProcessingStage.TEXT_NORMALIZATION, label: 'Normalizing text' },
        { stage: ProcessingStage.STRUCTURED_EXTRACTION, label: 'Extracting fields' },
        { stage: ProcessingStage.CONFIDENCE_SCORING, label: 'Scoring confidence' },
        { stage: ProcessingStage.VALIDATION, label: 'Validating fields' },
        { stage: ProcessingStage.CHUNKING, label: 'Chunking text' },
        { stage: ProcessingStage.EMBEDDING, label: 'Creating embeddings' },
        { stage: ProcessingStage.INDEXING, label: 'Indexing for search' },
      ];

      for (const { stage, label } of stages) {
        // Report progress (0-100)
        const progressPct = Math.round(
          ((stages.findIndex((s) => s.stage === stage) + 1) / stages.length) * 100,
        );
        await job.progress(progressPct);

        // Update stage in DB
        await this.updateVersionStatus(versionId, ProcessingStatus.PROCESSING, stage);
        await this.appendStageHistory(versionId, stage, 'PROCESSING');

        this.logger.debug(`[Job ${job.id}] Stage: ${label}`);

        // In Checkpoint 2: real logic goes here per stage
        // For now: short delay to simulate work (only in development)
        if (process.env['NODE_ENV'] !== 'test') {
          await new Promise((r) => setTimeout(r, 200));
        }

        await this.appendStageHistory(versionId, stage, 'COMPLETED');
      }

      // ── Mark as COMPLETED ─────────────────────────────────
      await this.updateVersionStatus(versionId, ProcessingStatus.COMPLETED, ProcessingStage.COMPLETED);
      await this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.COMPLETED },
      });
      await this.updateProcessingJob(documentId, versionId, ProcessingStatus.COMPLETED, ProcessingStage.COMPLETED);

      this.logger.log(
        `Document processing completed: document=${documentId} version=${versionId}`,
      );

      return { success: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Processing failed at document=${documentId}: ${error.message}`,
        error.stack,
      );
      throw error; // BullMQ will handle retry
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async updateVersionStatus(
    versionId: string,
    status: ProcessingStatus,
    stage: ProcessingStage,
  ): Promise<void> {
    const now = new Date();
    await this.db.documentVersion.update({
      where: { id: versionId },
      data: {
        processingStatus: status,
        processingStage: stage,
        ...(status === ProcessingStatus.PROCESSING && stage === ProcessingStage.FILE_VALIDATION
          ? { startedAt: now }
          : {}),
        ...(status === ProcessingStatus.COMPLETED
          ? { completedAt: now }
          : {}),
      },
    });
  }

  private async updateProcessingJob(
    documentId: string,
    versionId: string,
    status: ProcessingStatus,
    stage: ProcessingStage,
  ): Promise<void> {
    await this.db.processingJob.updateMany({
      where: { documentId, versionId },
      data: {
        status,
        currentStage: stage,
        ...(status === ProcessingStatus.COMPLETED
          ? { completedAt: new Date() }
          : {}),
        ...(status === ProcessingStatus.PROCESSING && stage === ProcessingStage.FILE_VALIDATION
          ? { startedAt: new Date() }
          : {}),
      },
    });
  }

  private async appendStageHistory(
    versionId: string,
    stage: ProcessingStage,
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
  ): Promise<void> {
    const version = await this.db.documentVersion.findUnique({
      where: { id: versionId },
      select: { stageHistory: true },
    });

    const history = Array.isArray(version?.stageHistory) ? version.stageHistory : [];
    const entry = { stage, status, timestamp: new Date().toISOString() };

    // Keep only last entry per stage to avoid duplication
    const filtered = (history as Array<{ stage: string; status: string; timestamp: string }>)
      .filter((h) => !(h.stage === stage && h.status === 'PROCESSING'));
    filtered.push(entry);

    await this.db.documentVersion.update({
      where: { id: versionId },
      data: { stageHistory: filtered },
    });
  }

  private async markDocumentFailed(
    documentId: string,
    versionId: string,
    errorMessage: string,
    errorStack?: string,
  ): Promise<void> {
    await Promise.all([
      this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED },
      }),
      this.db.documentVersion.update({
        where: { id: versionId },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          processingError: errorMessage,
          processingErrorStack: errorStack,
          completedAt: new Date(),
        },
      }),
      this.db.processingJob.updateMany({
        where: { documentId, versionId },
        data: {
          status: ProcessingStatus.FAILED,
          errorMessage,
          errorStack,
          completedAt: new Date(),
        },
      }),
    ]);
  }
}
