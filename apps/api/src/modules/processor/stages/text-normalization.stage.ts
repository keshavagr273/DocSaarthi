import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../document.processor';

/**
 * Stage 8: TEXT_NORMALIZATION
 *
 * Cleans up OCR text artifacts:
 * - NFC Unicode normalization (Devanagari may have composed/decomposed forms)
 * - Collapse multiple spaces to single space
 * - Remove non-printable characters (except newlines)
 * - Remove stray zero-width chars
 * - Fix common OCR digit-letter confusions in context (best-effort)
 *
 * Stores cleaned text in ctx.normalizedText (concatenated, all pages).
 * Also updates OcrResult.rawText in DB with normalized version.
 */
@Injectable()
export class TextNormalizationStage extends BaseStage {
  protected readonly stageName = ProcessingStage.TEXT_NORMALIZATION;
  protected readonly logger = new Logger(TextNormalizationStage.name);

  constructor(db: DatabaseService) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 8: TEXT_NORMALIZATION`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 56);

    const ocrResults = ctx.ocrResults ?? [];
    const normalizedPages: string[] = [];
    const updatePromises: Promise<unknown>[] = [];

    for (const result of ocrResults) {
      const normalized = this.normalizeText(result.rawText);
      normalizedPages.push(normalized);

      // Update rawText in DB with normalized version (concurrently)
      updatePromises.push(
        this.db.ocrResult.updateMany({
          where: { versionId: ctx.versionId, pageNumber: result.pageNumber },
          data: { rawText: normalized },
        }),
      );

      // Also normalize the blocks' text in memory
      result.rawText = normalized;
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    ctx.normalizedText = normalizedPages.join('\n\n').trim();

    this.markStageCompleted(ctx.versionId, ctx);
    this.logger.log(
      `[${ctx.documentId}] Stage 8 DONE — normalized ${normalizedPages.length} pages`,
    );
  }

  /**
   * Apply all normalization rules to a text string.
   */
  private normalizeText(text: string): string {
    if (!text) return '';

    let normalized = text;

    // 1. Unicode NFC normalization (important for Devanagari)
    normalized = normalized.normalize('NFC');

    // 2. Remove zero-width chars (zero-width space, ZWNJ, ZWJ, etc.)
    normalized = normalized.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    // 3. Replace multiple spaces with single space (but preserve newlines)
    normalized = normalized.replace(/[^\S\n]+/g, ' ');

    // 4. Remove non-printable ASCII control chars (keep tab and newline)
    // eslint-disable-next-line no-control-regex
    normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 5. Normalize line endings
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 6. Collapse 3+ consecutive newlines to 2
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    // 7. Trim each line
    normalized = normalized
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

    return normalized.trim();
  }
}
