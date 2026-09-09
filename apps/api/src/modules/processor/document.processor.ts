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
import { createPipelineContext, type PipelineContext, type OcrBlock } from './stages/pipeline-context';

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
import type { BaseStage } from './stages/base.stage';

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
 * Runs all 14 real processing stages in sequence.
 * Each stage is idempotent: on BullMQ retry, completed stages are skipped.
 *
 * Merged into the API process to avoid the need for a separate worker service.
 */
@Processor(QUEUES.DOCUMENT_PROCESSING)
export class DocumentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentProcessor.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private activeProcessingIds = new Set<string>();

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
    this.logger.log('Starting DB polling worker daemon for QUEUED documents...');
    this.pollingTimer = setInterval(() => {
      this.pollQueuedDocuments().catch((err) => {
        this.logger.error('Error in DB polling worker loop:', err);
      });
    }, 3000);
  }

  onModuleDestroy(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private async pollQueuedDocuments(): Promise<void> {
    const queuedDocs = await this.db.document.findMany({
      where: {
        status: DocumentStatus.QUEUED,
        currentVersionId: { not: null },
      },
      include: {
        versions: true,
      },
      take: 3,
      orderBy: { createdAt: 'asc' },
    });

    for (const doc of queuedDocs) {
      if (this.activeProcessingIds.has(doc.id)) continue;

      const version = doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions[0];
      if (!version || version.storageKey === 'PENDING') continue;

      this.activeProcessingIds.add(doc.id);
      this.logger.log(`[DB Poller] Found queued document ${doc.id} ("${doc.title}"). Dispatching pipeline...`);

      const syntheticJob = {
        id: `poll-${doc.id}`,
        data: {
          documentId: doc.id,
          versionId: version.id,
          userId: doc.userId,
          storageKey: version.storageKey,
          mimeType: doc.mimeType,
        },
        progress: async () => {},
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as unknown as Job<DocumentProcessingJobData>;

      // Run pipeline asynchronously so loop stays non-blocking
      this.processDocumentJob(syntheticJob)
        .catch((err) => {
          this.logger.error(`[DB Poller] Processing failed for document ${doc.id}: ${String(err)}`);
        })
        .finally(() => {
          this.activeProcessingIds.delete(doc.id);
        });
    }
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

        // Idempotency: skip stages already completed on a prior attempt
        const alreadyDone = await stage.isAlreadyCompleted(ctx);
        if (alreadyDone) {
          this.logger.debug(
            `[${documentId}] Skipping already-completed stage ${i + 1}/${totalStages}`,
          );

          // ── Context rehydration from DB ─────────────────────────
          // When a stage is skipped, its in-memory results are missing.
          // We must reload persisted data so downstream stages have context.
          await this.rehydrateContextForSkippedStage(ctx, stage, pipeline);

          continue;
        }

        const stageLabel = (stage as unknown as { stageName?: string }).stageName ?? stage.constructor.name;
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

  // ── Context rehydration from DB ─────────────────────────────────

  /**
   * When a stage is already completed and skipped on retry, reload its persisted
   * results back into ctx so that downstream stages have the data they need.
   */
  private async rehydrateContextForSkippedStage(
    ctx: PipelineContext,
    stage: BaseStage,
    pipeline: BaseStage[],
  ): Promise<void> {
    const { documentId, versionId } = ctx;

    // Determine which stage this is by index
    const stageIdx = pipeline.indexOf(stage);

    // Stage 2 (index 1): FILE_STORAGE — thumbnail key stored in documentVersion
    if (stageIdx === 1 && !ctx.thumbnailStorageKey) {
      const version = await this.db.documentVersion.findUnique({
        where: { id: versionId },
        select: { thumbnailStorageKey: true },
      });
      if (version?.thumbnailStorageKey) {
        ctx.thumbnailStorageKey = version.thumbnailStorageKey;
      }
    }

    // Stage 2 (index 2): PDF_RENDERING — pageIds from documentPages
    if (stageIdx === 2 && !ctx.pageIds) {
      const pages = await this.db.documentPage.findMany({
        where: { versionId },
        select: { id: true, pageNumber: true, storageKey: true },
        orderBy: { pageNumber: 'asc' },
      });
      ctx.pageIds = {};
      ctx.pageStorageKeys = {};
      for (const p of pages) {
        ctx.pageIds[p.pageNumber] = p.id;
        ctx.pageStorageKeys[p.pageNumber] = p.storageKey;
      }
      this.logger.debug(`[${documentId}] Rehydrated ${pages.length} page IDs from DB`);
    }

    // Stage 4 (index 4): OCR — ocrResults from ocrResult table
    if (stageIdx === 4 && !ctx.ocrResults) {
      const ocrRows = await this.db.ocrResult.findMany({
        where: { versionId },
        orderBy: { pageNumber: 'asc' },
      });
      ctx.ocrResults = ocrRows.map((row) => ({
        pageNumber: row.pageNumber,
        width: 0,
        height: 0,
        blocks: Array.isArray(row.blocks) ? (row.blocks as unknown as OcrBlock[]) : [],
        rawText: row.rawText ?? '',
        pageConfidence: row.pageConfidence ?? 0,
        pageLanguage: row.pageLanguage ?? 'en',
        processingTimeMs: row.processingTimeMs ?? 0,
        fallbackUsed: row.fallbackUsed ?? false,
      }));
      this.logger.debug(
        `[${documentId}] Rehydrated ${ctx.ocrResults.length} OCR pages from DB`,
      );
    }

    // Stage 5 (index 5): LANGUAGE_DETECTION — derive from already-rehydrated ocrResults
    if (stageIdx === 5 && !ctx.primaryLanguage) {
      // Language is stored in ocrResult rows; derive from most common pageLanguage
      if (ctx.ocrResults && ctx.ocrResults.length > 0) {
        ctx.primaryLanguage = ctx.ocrResults[0]?.pageLanguage ?? 'en';
      } else {
        ctx.primaryLanguage = 'en';
      }
    }

    // Stage 11 (index 11): CHUNKING — chunkIds + full chunks from documentChunks
    if (stageIdx === 11 && !ctx.chunkIds) {
      const chunkRows = await this.db.documentChunk.findMany({
        where: { versionId },
        select: {
          id: true,
          chunkIndex: true,
          content: true,
          pageNumber: true,
          sectionTitle: true,
          tokenCount: true,
          charCount: true,
          language: true,
        },
        orderBy: { chunkIndex: 'asc' },
      });
      ctx.chunkIds = chunkRows.map((c) => c.id);
      ctx.chunks = chunkRows.map((c) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle ?? undefined,
        tokenCount: c.tokenCount,
        charCount: c.charCount,
        language: c.language ?? undefined,
      }));
      this.logger.debug(
        `[${documentId}] Rehydrated ${ctx.chunkIds.length} chunks (with content) from DB`,
      );
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
