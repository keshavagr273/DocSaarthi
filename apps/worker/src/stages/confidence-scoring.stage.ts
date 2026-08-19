import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import type { PipelineContext, OcrBlock } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * Stage 10: CONFIDENCE_SCORING
 *
 * Recalculates field confidence using a weighted formula:
 *   final_confidence = (llm_confidence × 0.7) + (best_matching_ocr_block_confidence × 0.3)
 *
 * Also assigns confidenceLevel: HIGH / MEDIUM / LOW
 */
@Injectable()
export class ConfidenceScoringStage extends BaseStage {
  protected readonly stageName = ProcessingStage.CONFIDENCE_SCORING;
  protected readonly logger = new Logger(ConfidenceScoringStage.name);

  constructor(db: DatabaseService) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 10: CONFIDENCE_SCORING`);
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 68);

    const fields = ctx.extractedFields ?? [];
    const ocrResults = ctx.ocrResults ?? [];

    // Flatten all OCR blocks for lookup
    const allBlocks: OcrBlock[] = ocrResults.flatMap((r) => r.blocks);

    // Load fields from DB to get their IDs
    const dbFields = await this.db.documentField.findMany({
      where: { documentId: ctx.documentId, isRejected: false },
      select: { id: true, fieldName: true, rawValue: true, confidence: true },
    });

    for (const dbField of dbFields) {
      const ctxField = fields.find((f) => f.fieldName === dbField.fieldName);
      const llmConfidence = ctxField?.confidence ?? dbField.confidence;

      // Find best matching OCR block by looking for the rawValue in block texts
      const ocrConfidence = this.findBestOcrConfidence(dbField.rawValue, allBlocks);

      // Weighted formula
      const finalConfidence = ocrConfidence !== null
        ? llmConfidence * 0.7 + ocrConfidence * 0.3
        : llmConfidence;

      const clampedConfidence = Math.min(1, Math.max(0, finalConfidence));
      const confidenceLevel = this.toLevel(clampedConfidence);

      await this.db.documentField.update({
        where: { id: dbField.id },
        data: {
          confidence: clampedConfidence,
          confidenceLevel: confidenceLevel as never,
        },
      });

      // Keep ctx in sync
      if (ctxField) {
        ctxField.confidence = clampedConfidence;
      }
    }

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(
      `[${ctx.documentId}] Stage 10 DONE — rescored ${dbFields.length} fields`,
    );
  }

  /**
   * Find the highest-confidence OCR block that contains the field value text.
   */
  private findBestOcrConfidence(
    rawValue: string,
    blocks: OcrBlock[],
  ): number | null {
    if (!rawValue || blocks.length === 0) return null;

    const normalizedValue = rawValue.trim().toLowerCase();
    let best: number | null = null;

    for (const block of blocks) {
      const blockText = block.text.trim().toLowerCase();
      if (blockText.includes(normalizedValue) || normalizedValue.includes(blockText)) {
        if (best === null || block.confidence > best) {
          best = block.confidence;
        }
      }
    }

    return best;
  }

  private toLevel(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (confidence >= 0.85) return 'HIGH';
    if (confidence >= 0.65) return 'MEDIUM';
    return 'LOW';
  }
}
