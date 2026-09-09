import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../document.processor';

/**
 * Stage 6: LANGUAGE_DETECTION
 *
 * Counts Devanagari vs Latin characters in all OCR blocks.
 * Aggregates to page level and document level.
 * Updates documents.primaryLanguage and documents.secondaryLanguages.
 */
@Injectable()
export class LanguageDetectionStage extends BaseStage {
  protected readonly stageName = ProcessingStage.LANGUAGE_DETECTION;
  protected readonly logger = new Logger(LanguageDetectionStage.name);

  constructor(db: DatabaseService) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 6: LANGUAGE_DETECTION`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 46);

    const ocrResults = ctx.ocrResults ?? [];

    if (ocrResults.length === 0) {
      ctx.primaryLanguage = 'unknown';
      ctx.secondaryLanguages = [];
    } else {
      const pageLangs = ocrResults.map((r) => this.detectLanguage(r.rawText));
      const { primary, secondary } = this.aggregateLanguages(pageLangs);
      ctx.primaryLanguage = primary;
      ctx.secondaryLanguages = secondary;
    }

    await this.db.document.update({
      where: { id: ctx.documentId },
      data: {
        primaryLanguage: ctx.primaryLanguage,
        secondaryLanguages: ctx.secondaryLanguages,
      },
    });

    this.markStageCompleted(ctx.versionId, ctx);
    this.logger.log(
      `[${ctx.documentId}] Stage 6 DONE — lang=${ctx.primaryLanguage}`,
    );
  }

  /**
   * Classify the language of a text string based on Unicode script ratios.
   */
  private detectLanguage(text: string): 'hi' | 'en' | 'hi+en' | 'unknown' {
    let devanagari = 0;
    let latin = 0;

    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      // Devanagari block: U+0900–U+097F
      if (code >= 0x0900 && code <= 0x097f) devanagari++;
      else if (/[a-zA-Z]/.test(char)) latin++;
    }

    const total = devanagari + latin;
    if (total < 5) return 'unknown'; // not enough characters to decide

    const devaRatio = devanagari / total;

    if (devaRatio > 0.6) return 'hi';
    if (devaRatio < 0.2) return 'en';
    return 'hi+en';
  }

  /**
   * Take per-page language votes and return primary + secondary.
   */
  private aggregateLanguages(
    pageLangs: string[],
  ): { primary: string; secondary: string[] } {
    const counts: Record<string, number> = {};

    for (const lang of pageLangs) {
      if (lang !== 'unknown') {
        counts[lang] = (counts[lang] ?? 0) + 1;
      }
    }

    if (Object.keys(counts).length === 0) {
      return { primary: 'unknown', secondary: [] };
    }

    // Sort by frequency
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const primary = sorted[0]![0];
    const secondary = sorted.slice(1).map(([lang]) => lang);

    return { primary, secondary };
  }
}
