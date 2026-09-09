import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import * as path from 'path';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { StorageService } from '../../storage/storage.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../document.processor';

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
    private readonly storage: StorageService,
  ) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 2: FILE_STORAGE`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 8);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');

    const thumbnailKey = this.buildThumbnailKey(ctx.storageKey);
    let thumbnailBuffer: Buffer;

    if (ctx.mimeType === 'application/pdf') {
      // Reuse the PDF buffer already downloaded by Stage 1 (FileValidationStage)
      thumbnailBuffer = await this.renderPdfThumbnail(ctx.storageKey, ctx.pdfBuffer);
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

    this.markStageCompleted(ctx.versionId, ctx);
    this.logger.log(
      `[${ctx.documentId}] Stage 2 DONE — thumbnail=${thumbnailKey} | ` +
      `bufferSize=${(thumbnailBuffer.length / 1024).toFixed(1)}KB`,
    );
    this.logger.debug(
      `[${ctx.documentId}] Stage 2 DETAILS:\n` +
      `  thumbnailKey        : ${thumbnailKey}\n` +
      `  thumbnailBufferBytes: ${thumbnailBuffer.length}\n` +
      `  sourceType          : ${ctx.mimeType === 'application/pdf' ? 'pdf-first-page' : 'image-resize'}`,
    );
  }

  private async renderPdfThumbnail(storageKey: string, cachedBuffer?: Buffer): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');
    // Reuse the cached buffer from Stage 1 if available; otherwise download
    const pdfBuffer = cachedBuffer ?? await this.storage.downloadBuffer(storageKey);

    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const { createCanvas } = await import('@napi-rs/canvas');

      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBuffer),
        useSystemFonts: true,
        disableFontFace: true,
      });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const canvasContext = canvas.getContext('2d');

      await page.render({ canvasContext, viewport }).promise;
      const pngBuffer = canvas.toBuffer('image/png');

      const thumbnailBuffer = await sharp(pngBuffer)
        .resize(400, null, { withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer();

      return thumbnailBuffer;
    } catch (err) {
      this.logger.warn(`PDF thumbnail rendering failed: ${String(err)}`);
      return sharp({ create: { width: 400, height: 560, channels: 3, background: '#1e293b' } })
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
