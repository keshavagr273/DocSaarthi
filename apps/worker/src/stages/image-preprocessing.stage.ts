import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { StorageClientService } from '../services/storage-client.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * Stage 4: IMAGE_PREPROCESSING
 *
 * For each page image:
 * - Auto-rotate based on EXIF orientation
 * - Normalize contrast
 * - Sharpen slightly
 * - Keep buffers in ctx.preprocessedBuffers for Stage 5 (OCR) to consume
 *
 * We pass buffers forward in memory to avoid an extra MinIO upload/download round-trip.
 * If memory pressure is a concern with large docs, we could write to MinIO instead.
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
        let rawBuffer: Buffer;

        // For images (single page), ctx.storageKey is the page storageKey
        rawBuffer = await this.storage.downloadBuffer(storageKey);

        const processed = await sharp(rawBuffer)
          .rotate() // auto-rotate from EXIF
          .normalize() // stretch contrast to use full dynamic range
          .sharpen({ sigma: 1.0, m1: 0.5, m2: 0.5 }) // gentle sharpening for OCR
          .png({ compressionLevel: 6 })
          .toBuffer();

        preprocessedBuffers[pageNum] = processed;
      } catch (err) {
        this.logger.warn(
          `[${ctx.documentId}] Preprocessing failed for page ${pageNum}: ${String(err)}. Using raw.`,
        );

        // If preprocessing fails, try to use raw buffer
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
