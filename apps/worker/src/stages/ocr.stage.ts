import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { OcrClientService } from '../services/ocr-client.service';
import { LlmService } from '../services/llm.service';
import type { PipelineContext, OcrPageResult, OcrBlock } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * Stage 5: OCR with VLM Fallback & Selective Block Refinement
 *
 * 1. Calls PaddleOCR sidecar.
 * 2. If confidence < 0.70 or PaddleOCR is unavailable/empty: routes to Vision LLM fallback.
 * 3. If confidence >= 0.70 but individual blocks are < 0.65: crops block regions with sharp
 *    and refines text with targeted Vision LLM re-reading.
 */
@Injectable()
export class OcrStage extends BaseStage {
  protected readonly stageName = ProcessingStage.OCR;
  protected readonly logger = new Logger(OcrStage.name);

  constructor(
    db: DatabaseService,
    private readonly ocrClient: OcrClientService,
    private readonly llm: LlmService,
  ) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 5: OCR (with VLM Fallback)`);
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 30);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');

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
        // Step 1: Run standard OCR
        const paddleResult = await this.ocrClient.recognizePage(buffer, pageNum);

        // Step 2: Check if VLM Fallback is required (< 0.70 confidence or fallback was flagged or 0 blocks)
        if (paddleResult.pageConfidence < 0.70 || paddleResult.fallbackUsed || paddleResult.blocks.length === 0) {
          this.logger.log(
            `[${ctx.documentId}] Page ${pageNum} confidence=${paddleResult.pageConfidence.toFixed(2)}. Triggering VLM OCR Fallback...`,
          );

          // Get image dimensions for coordinate scaling
          let width = paddleResult.width || 1000;
          let height = paddleResult.height || 1400;
          try {
            const meta = await sharp(buffer).metadata();
            width = meta.width ?? width;
            height = meta.height ?? height;
          } catch {
            // keep defaults
          }

          const vlmResult = await this.llm.extractTextFromVision(buffer, pageNum, width, height);

          // If VLM extracted text, prefer it; otherwise keep paddleResult
          if (vlmResult.blocks.length > 0) {
            result = vlmResult;
          } else {
            result = paddleResult;
          }
        } else {
          // Step 3: High overall confidence, but refine individual low-confidence blocks (< 0.65)
          result = paddleResult;
          const lowConfidenceBlocks = result.blocks.filter((b) => b.confidence < 0.65);

          if (lowConfidenceBlocks.length > 0 && lowConfidenceBlocks.length <= 5) {
            this.logger.log(
              `[${ctx.documentId}] Refining ${lowConfidenceBlocks.length} low-confidence blocks on page ${pageNum}`,
            );

            try {
              const meta = await sharp(buffer).metadata();
              const imgW = meta.width ?? 1000;
              const imgH = meta.height ?? 1400;

              for (const block of lowConfidenceBlocks) {
                const [x1, y1, x2, y2] = block.bbox;
                const cropLeft = Math.max(0, Math.min(imgW - 1, Math.round(x1)));
                const cropTop = Math.max(0, Math.min(imgH - 1, Math.round(y1)));
                const cropWidth = Math.max(10, Math.min(imgW - cropLeft, Math.round(x2 - x1)));
                const cropHeight = Math.max(10, Math.min(imgH - cropTop, Math.round(y2 - y1)));

                if (cropWidth > 5 && cropHeight > 5) {
                  const cropBuffer = await sharp(buffer)
                    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
                    .png()
                    .toBuffer();

                  const refined = await this.llm.refineBlockWithVision(cropBuffer, block.text);
                  block.text = refined.text;
                  block.confidence = refined.confidence;
                }
              }

              // Recompute page confidence and raw text
              result.rawText = result.blocks.map((b: OcrBlock) => b.text).join('\n');
              result.pageConfidence = Number(
                (result.blocks.reduce((s: number, b: OcrBlock) => s + b.confidence, 0) / result.blocks.length).toFixed(4),
              );
            } catch (cropErr) {
              this.logger.warn(`Failed to crop low-confidence blocks: ${String(cropErr)}`);
            }
          }
        }
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
          ocrProvider: result.fallbackUsed ? 'vlm' : 'paddle',
          fallbackUsed: result.fallbackUsed,
          fallbackProvider: result.fallbackUsed ? 'openai-vision' : null,
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
        `avg confidence=${this.avgConfidence(ocrResults).toFixed(2)}, ` +
        `fallbacks=${ocrResults.filter((r) => r.fallbackUsed).length}`,
    );
  }

  private avgConfidence(results: OcrPageResult[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.pageConfidence, 0) / results.length;
  }
}
