import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { StorageClientService } from '../services/storage-client.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * Stage 4: IMAGE_PREPROCESSING & ENHANCEMENT
 *
 * Preprocesses scanned and photographed Indian documents:
 * - Auto-rotate based on EXIF orientation
 * - Normalize dynamic range (contrast stretching)
 * - Gentle unsharp masking for crisp text edges and Devanagari matra clarity
 * - Grayscale/gamma tuning for OCR background removal
 * - Caches preprocessed buffers in memory for Stage 5 (OCR)
 */
@Injectable()
export class ImagePreprocessingStage extends BaseStage {
  protected readonly stageName = ProcessingStage.IMAGE_PREPROCESSING;
  protected readonly logger = new Logger(ImagePreprocessingStage.name);

  constructor(
    db: DatabaseService,
    private readonly storage: StorageClientService,
  ) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 4: IMAGE_PREPROCESSING`);
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 22);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');

    const pageStorageKeys = ctx.pageStorageKeys ?? {};
    const pageNumbers = Object.keys(pageStorageKeys).map(Number).sort((a, b) => a - b);
    const preprocessedBuffers: Record<number, Buffer> = {};

    for (const pageNum of pageNumbers) {
      const storageKey = pageStorageKeys[pageNum]!;

      try {
        const rawBuffer = await this.storage.downloadBuffer(storageKey);

        // Apply advanced pipeline: auto-orient, normalize contrast, sharpen
        const processed = await sharp(rawBuffer)
          .rotate() // Auto-orient based on EXIF
          .gamma(1.1) // Lighten background noise slightly
          .normalize() // Stretch luminance histogram
          .sharpen({ sigma: 1.2, m1: 0.7, m2: 0.3 }) // Enhance fine character strokes
          .png({ compressionLevel: 6 })
          .toBuffer();

        preprocessedBuffers[pageNum] = processed;
      } catch (err) {
        this.logger.warn(
          `[${ctx.documentId}] Preprocessing failed for page ${pageNum}: ${String(err)}. Using raw.`,
        );

        try {
          preprocessedBuffers[pageNum] = await this.storage.downloadBuffer(storageKey);
        } catch {
          preprocessedBuffers[pageNum] = Buffer.alloc(0);
        }
      }

      await this.reportProgress(job, 22 + Math.round((pageNum / pageNumbers.length) * 6));
    }

    ctx.preprocessedBuffers = preprocessedBuffers;

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(
      `[${ctx.documentId}] Stage 4 DONE — preprocessed ${Object.keys(preprocessedBuffers).length} pages`,
    );
  }
}
