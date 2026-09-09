import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import * as path from 'path';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { StorageService } from '../../storage/storage.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from './pipeline-context';

/**
 * Stage 3: PDF_RENDERING
 *
 * - For PDFs: renders every page at 300 DPI → PNG → uploads to MinIO → creates document_pages rows
 * - For images: creates a single document_pages row pointing to the original file
 */
@Injectable()
export class PdfRenderingStage extends BaseStage {
  protected readonly stageName = ProcessingStage.PDF_RENDERING;
  protected readonly logger = new Logger(PdfRenderingStage.name);

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
    this.logger.log(`[${ctx.documentId}] Stage 3: PDF_RENDERING`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 14);

    const pageIds: Record<number, string> = {};
    const pageStorageKeys: Record<number, string> = {};

    const isPdf =
      ctx.mimeType === 'application/pdf' ||
      (!ctx.mimeType && ctx.storageKey?.toLowerCase().endsWith('.pdf'));

    if (isPdf) {
      const pdfBuffer = await this.storage.downloadBuffer(ctx.storageKey);
      // Cache the buffer in ctx so Stage 5 (OCR) can reuse it without a re-download
      ctx.pdfBuffer = pdfBuffer;
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const { createCanvas } = await import('@napi-rs/canvas');

      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBuffer),
        useSystemFonts: true,
        disableFontFace: true,
      });
      const doc = await loadingTask.promise;
      const pageCount = doc.numPages;

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        await this.reportProgress(job, 14 + Math.round((pageNum / pageCount) * 6));

        let width = 0;
        let height = 0;
        let pageBuffer: Buffer;

        try {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for sharp text OCR and UI viewing
          const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
          const canvasContext = canvas.getContext('2d');

          await page.render({ canvasContext, viewport }).promise;
          // Note: @napi-rs/canvas PNG encoding does not expose compressionLevel in types;
          // the library uses a fast default internally
          pageBuffer = canvas.toBuffer('image/png');
          width = Math.round(viewport.width);
          height = Math.round(viewport.height);
        } catch (err) {
          this.logger.warn(`Failed to render page ${pageNum}: ${String(err)}`);
          pageBuffer = Buffer.alloc(0);
        }

        const pageKey = this.buildPageKey(ctx.storageKey, pageNum);

        if (pageBuffer.length > 0) {
          await this.storage.uploadBuffer(pageKey, pageBuffer, 'image/png');
        }

        // Upsert document_pages record
        const page = await this.db.documentPage.upsert({
          where: {
            versionId_pageNumber: {
              versionId: ctx.versionId,
              pageNumber: pageNum,
            },
          },
          create: {
            versionId: ctx.versionId,
            pageNumber: pageNum,
            storageKey: pageKey,
            width,
            height,
          },
          update: { storageKey: pageKey, width, height },
        });

        pageIds[pageNum] = page.id;
        pageStorageKeys[pageNum] = pageKey;

        this.logger.debug(
          `[${ctx.documentId}] S3 page ${pageNum}: ${width}x${height}px → ${(pageBuffer.length / 1024).toFixed(1)}KB PNG → ${pageKey}`,
        );
      }
    } else {
      // Single-page image — use original as the page
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = require('sharp') as typeof import('sharp');
      let width = 0;
      let height = 0;

      try {
        const buf = await this.storage.downloadBuffer(ctx.storageKey);
        const meta = await sharp(buf).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
      } catch {
        // ok — dimensions are optional
      }

      const page = await this.db.documentPage.upsert({
        where: {
          versionId_pageNumber: {
            versionId: ctx.versionId,
            pageNumber: 1,
          },
        },
        create: {
          versionId: ctx.versionId,
          pageNumber: 1,
          storageKey: ctx.storageKey,
          width,
          height,
        },
        update: { storageKey: ctx.storageKey, width, height },
      });

      pageIds[1] = page.id;
      pageStorageKeys[1] = ctx.storageKey;
    }

    ctx.pageIds = pageIds;
    ctx.pageStorageKeys = pageStorageKeys;

    this.markStageCompleted(ctx.versionId, ctx);
    const renderedCount = Object.keys(pageStorageKeys).length;
    this.logger.log(
      `[${ctx.documentId}] Stage 3 DONE — rendered ${renderedCount} pages (pdfBuffer cached=${!!ctx.pdfBuffer})`,
    );
    this.logger.debug(
      `[${ctx.documentId}] Stage 3 DETAILS:\n` +
      Object.entries(pageStorageKeys)
        .map(([pg, key]) => `  page ${pg}: ${key}`)
        .join('\n'),
    );
  }

  private buildPageKey(originalStorageKey: string, pageNum: number): string {
    const dir = path.dirname(originalStorageKey);
    const versionDir = path.dirname(dir);
    return `${versionDir}/pages/page_${pageNum}.png`;
  }
}
