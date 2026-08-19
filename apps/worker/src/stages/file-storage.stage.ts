import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import * as path from 'path';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { StorageClientService } from '../services/storage-client.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * Stage 2: FILE_STORAGE
 *
 * Generates a thumbnail and stores it in MinIO.
 * - PDF: renders first page at 150 DPI → WebP
 * - Image: resizes to max 400px width → WebP
 */
@Injectable()
export class FileStorageStage extends BaseStage {
  protected readonly stageName = ProcessingStage.FILE_STORAGE;
  protected readonly logger = new Logger(FileStorageStage.name);

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
    this.logger.log(`[${ctx.documentId}] Stage 2: FILE_STORAGE`);
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 8);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');

    const thumbnailKey = this.buildThumbnailKey(ctx.storageKey);
    let thumbnailBuffer: Buffer;

    if (ctx.mimeType === 'application/pdf') {
      // For PDF: render first page at 150 DPI using pdf2pic
      thumbnailBuffer = await this.renderPdfThumbnail(ctx.storageKey);
    } else {
      // For images: resize and convert
      const original = await this.storage.downloadBuffer(ctx.storageKey);
      thumbnailBuffer = await sharp(original)
        .resize(400, null, { withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer();
    }

    await this.storage.uploadBuffer(thumbnailKey, thumbnailBuffer, 'image/webp');

    ctx.thumbnailStorageKey = thumbnailKey;

    await this.db.documentVersion.update({
      where: { id: ctx.versionId },
      data: { thumbnailStorageKey: thumbnailKey },
    });

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(`[${ctx.documentId}] Stage 2 DONE — thumbnail=${thumbnailKey}`);
  }

  private async renderPdfThumbnail(storageKey: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');
    const { fromBuffer } = await import('pdf2pic');

    const pdfBuffer = await this.storage.downloadBuffer(storageKey);

    try {
      const converter = fromBuffer(pdfBuffer, {
        density: 150,
        format: 'png',
        width: 800,
        height: 1200,
      });

      const page = await converter(1, { responseType: 'buffer' });
      if (!page.buffer) throw new Error('pdf2pic returned no buffer');

      const thumbnailBuffer = await sharp(page.buffer)
        .resize(400, null, { withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer();

      return thumbnailBuffer;
    } catch (err) {
      this.logger.warn(`pdf2pic thumbnail failed, using placeholder: ${String(err)}`);
      // Return a 1x1 white WebP as placeholder if rendering fails
      return sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } })
        .webp()
        .toBuffer();
    }
  }

  private buildThumbnailKey(originalStorageKey: string): string {
    // Replace the filename with thumbnail.webp
    const dir = path.dirname(originalStorageKey);
    const versionDir = path.dirname(dir); // go up one level (out of original/)
    return `${versionDir}/thumbnail.webp`;
  }
}
