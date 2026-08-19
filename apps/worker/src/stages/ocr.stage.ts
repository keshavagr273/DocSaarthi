import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { OcrClientService } from '../services/ocr-client.service';
import type { PipelineContext, OcrPageResult } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * Stage 5: OCR
 *
 * Sends each preprocessed page image to the PaddleOCR sidecar.
 * Stores OcrResult rows in the database.
 */
@Injectable()
export class OcrStage extends BaseStage {
  protected readonly stageName = ProcessingStage.OCR;
  protected readonly logger = new Logger(OcrStage.name);

  constructor(
    db: DatabaseService,
    private readonly ocrClient: OcrClientService,
  ) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 5: OCR`);
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 30);

    const preprocessedBuffers = ctx.preprocessedBuffers ?? {};
    const pageIds = ctx.pageIds ?? {};
    const pageNumbers = Object.keys(preprocessedBuffers).map(Number).sort((a, b) => a - b);

    const ocrResults: OcrPageResult[] = [];

    for (const pageNum of pageNumbers) {
      const buffer = preprocessedBuffers[pageNum] ?? Buffer.alloc(0);

      await this.reportProgress(
        job,
        30 + Math.round((pageNum / (pageNumbers.length || 1)) * 14),
      );

      let result: OcrPageResult;

      if (buffer.length === 0) {
        this.logger.warn(`[${ctx.documentId}] Empty buffer for page ${pageNum}, skipping OCR`);
        result = {
          pageNumber: pageNum,
          width: 0,
          height: 0,
          blocks: [],
          rawText: '',
          pageConfidence: 0,
          pageLanguage: 'unknown',
          processingTimeMs: 0,
          fallbackUsed: true,
        };
      } else {
        result = await this.ocrClient.recognizePage(buffer, pageNum);
      }

      ocrResults.push(result);

      // Delete existing OCR result for this page (idempotency on retry) then create fresh
      await this.db.ocrResult.deleteMany({
        where: { versionId: ctx.versionId, pageNumber: pageNum },
      });
      await this.db.ocrResult.create({
        data: {
          versionId: ctx.versionId,
          pageId: pageIds[pageNum] ?? null,
          pageNumber: pageNum,
          rawText: result.rawText,
          blocks: result.blocks as unknown as object[],
          pageConfidence: result.pageConfidence,
          pageLanguage: result.pageLanguage,
          ocrProvider: 'paddle',
          fallbackUsed: result.fallbackUsed,
          processingTimeMs: result.processingTimeMs,
        },
      });

      // Update document_pages with detected language and confidence
      if (pageIds[pageNum]) {
        await this.db.documentPage.update({
          where: { id: pageIds[pageNum] },
          data: {
            language: result.pageLanguage,
            confidence: result.pageConfidence,
          },
        });
      }
    }

    ctx.ocrResults = ocrResults;

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(
      `[${ctx.documentId}] Stage 5 DONE — OCR'd ${ocrResults.length} pages, ` +
        `avg confidence=${this.avgConfidence(ocrResults).toFixed(2)}`,
    );
  }

  private avgConfidence(results: OcrPageResult[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.pageConfidence, 0) / results.length;
  }
}
