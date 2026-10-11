import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { LlmService } from '../services/llm.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from './pipeline-context';

/**
 * Stage 7: DOCUMENT_CLASSIFICATION
 *
 * Sends the first 2000 chars of OCR text to gpt-4o-mini.
 * Classifies the document into one of the predefined categories.
 * Updates documents.category and documents.categoryConfidence.
 */
@Injectable()
export class ClassificationStage extends BaseStage {
  protected readonly stageName = ProcessingStage.DOCUMENT_CLASSIFICATION;
  protected readonly logger = new Logger(ClassificationStage.name);

  constructor(
    db: DatabaseService,
    private readonly llm: LlmService,
  ) {
    super(db);
  }

  /**
   * ctx.category drives which extraction schema Stage 9 uses. Without this,
   * a retry that skipped classification extracted against the UNKNOWN schema.
   */
  async rehydrate(ctx: PipelineContext): Promise<void> {
    if (ctx.category) return;

    const document = await this.db.document.findUnique({
      where: { id: ctx.documentId },
      select: { category: true, categoryConfidence: true },
    });

    ctx.category = document?.category ?? 'UNKNOWN';
    ctx.categoryConfidence = document?.categoryConfidence ?? 0;

    this.logger.debug(
      `[${ctx.documentId}] Rehydrated category=${ctx.category} from DB`,
    );
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 7: DOCUMENT_CLASSIFICATION`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 50);

    // A category the user set by hand must survive reprocessing — don't let
    // the classifier overwrite a manual override.
    const document = await this.db.document.findUnique({
      where: { id: ctx.documentId },
      select: { category: true, categoryConfidence: true, categoryOverride: true },
    });

    if (document?.categoryOverride) {
      ctx.category = document.category ?? 'UNKNOWN';
      ctx.categoryConfidence = document.categoryConfidence ?? 1;
      this.markStageCompleted(ctx.versionId, ctx);
      this.logger.log(
        `[${ctx.documentId}] Stage 7 SKIPPED — keeping user override category=${ctx.category}`,
      );
      return;
    }

    // Concatenate OCR text from all pages
    const ocrText = (ctx.ocrResults ?? [])
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((r) => r.rawText)
      .join('\n\n');

    const result = await this.llm.classifyDocument(ocrText);

    // Apply minimum confidence threshold. `result.category` is already
    // validated against the DocumentCategory enum by LlmService, so it is
    // always safe to write.
    const MIN_CONFIDENCE = 0.5;
    const category = result.confidence >= MIN_CONFIDENCE ? result.category : 'UNKNOWN';
    const confidence = result.confidence;

    ctx.category = category;
    ctx.categoryConfidence = confidence;

    await this.db.document.update({
      where: { id: ctx.documentId },
      data: {
        category: category as never,
        categoryConfidence: confidence,
      },
    });

    this.markStageCompleted(ctx.versionId, ctx);
    this.logger.log(
      `[${ctx.documentId}] Stage 7 DONE — category=${category} | confidence=${(confidence * 100).toFixed(1)}%`,
    );
    this.logger.debug(
      `[${ctx.documentId}] Stage 7 DETAILS:\n` +
      `  category    : ${category}\n` +
      `  confidence  : ${(confidence * 100).toFixed(1)}%\n` +
      `  ocrTextLen  : ${ocrText.length} chars\n` +
      `  ocrSample   : "${ocrText.substring(0, 200).replace(/\n/g, ' ')}..."`,
    );
  }
}
