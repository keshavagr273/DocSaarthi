import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import * as path from 'path';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { StorageClientService } from '../services/storage-client.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

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
    private readonly storage: StorageClientService,
  ) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 3: PDF_RENDERING (pages=${ctx.pageCount})`);
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 14);

    const pageIds: Record<number, string> = {};
    const pageStorageKeys: Record<number, string> = {};

    if (ctx.mimeType === 'application/pdf') {
      const pdfBuffer = await this.storage.downloadBuffer(ctx.storageKey);
      const { fromBuffer } = await import('pdf2pic');

      const pageCount = ctx.pageCount ?? 1;

      const converter = fromBuffer(pdfBuffer, {
        density: 300,
        format: 'png',
        width: 2480, // A4 at 300 DPI ≈ 2480px wide
        height: 3508,
      });

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        await this.reportProgress(job, 14 + Math.round((pageNum / pageCount) * 6));

        let width = 0;
        let height = 0;
        let pageBuffer: Buffer;

        try {
          const result = await converter(pageNum, { responseType: 'buffer' });
          if (!result.buffer) throw new Error('No buffer from pdf2pic');
          pageBuffer = result.buffer;

          // Get dimensions
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const sharp = require('sharp') as typeof import('sharp');
          const meta = await sharp(pageBuffer).metadata();
          width = meta.width ?? 0;
          height = meta.height ?? 0;
        } catch (err) {
          this.logger.warn(`Failed to render page ${pageNum}: ${String(err)}`);
          // Create an empty buffer and continue — OCR will produce empty results
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

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(
      `[${ctx.documentId}] Stage 3 DONE — rendered ${Object.keys(pageStorageKeys).length} pages`,
    );
  }

  private buildPageKey(originalStorageKey: string, pageNum: number): string {
    const dir = path.dirname(originalStorageKey);
    const versionDir = path.dirname(dir);
    return `${versionDir}/pages/page_${pageNum}.png`;
  }
}
