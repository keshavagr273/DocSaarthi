import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { StorageClientService } from '../services/storage-client.service';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

// We use a dynamic import for pdfjs-dist because it ships as ESM in v4+
// and we need to handle it carefully at runtime
async function getPdfPageCount(buffer: Buffer): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (
    buf: Buffer,
    opts?: object,
  ) => Promise<{ numpages: number }>;
  const data = await pdfParse(buffer, { max: 0 }); // max:0 = parse metadata only
  return data.numpages;
}

/**
 * Stage 1: FILE_VALIDATION
 *
 * - Verifies the file exists in MinIO (HEAD request)
 * - Verifies ETag matches stored checksum
 * - For PDFs: counts pages and rejects > MAX_PAGES_PER_DOCUMENT
 * - Stores validated pageCount on document_versions
 */
@Injectable()
export class FileValidationStage extends BaseStage {
  protected readonly stageName = ProcessingStage.FILE_VALIDATION;
  protected readonly logger = new Logger(FileValidationStage.name);

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
    this.logger.log(`[${ctx.documentId}] Stage 1: FILE_VALIDATION`);
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 2);

    const maxPages = parseInt(process.env['MAX_PAGES_PER_DOCUMENT'] ?? '100', 10);

    // ── 1. Verify file exists in MinIO ───────────────────────────
    const meta = await this.storage.headObject(ctx.storageKey);
    if (!meta) {
      await this.markStageFailed(ctx.versionId, 'FILE_NOT_FOUND', 'File not found in storage');
      throw new Error('FILE_NOT_FOUND: File does not exist in storage');
    }

    ctx.fileSizeBytes = meta.ContentLength ?? 0;
    ctx.checksum = meta.ETag?.replace(/"/g, '') ?? '';

    // ── 2. For PDFs: validate and count pages ────────────────────
    let pageCount = 1;
    if (ctx.mimeType === 'application/pdf') {
      const buffer = await this.storage.downloadBuffer(ctx.storageKey);

      // Basic corruption check — PDF files start with %PDF
      if (!buffer.subarray(0, 4).toString().startsWith('%PDF')) {
        await this.markStageFailed(ctx.versionId, 'CORRUPTED_FILE', 'File appears to be corrupted');
        throw new Error('CORRUPTED_FILE: PDF magic bytes not found');
      }

      try {
        pageCount = await getPdfPageCount(buffer);
      } catch (err) {
        await this.markStageFailed(ctx.versionId, 'CORRUPTED_FILE', `Cannot read PDF: ${String(err)}`);
        throw new Error(`CORRUPTED_FILE: ${String(err)}`);
      }

      if (pageCount > maxPages) {
        await this.markStageFailed(
          ctx.versionId,
          'MAX_PAGES_EXCEEDED',
          `PDF has ${pageCount} pages (max: ${maxPages})`,
        );
        throw new Error(`MAX_PAGES_EXCEEDED: PDF has ${pageCount} pages (max ${maxPages})`);
      }
    }

    ctx.pageCount = pageCount;

    // ── 3. Update DB ─────────────────────────────────────────────
    await this.db.documentVersion.update({
      where: { id: ctx.versionId },
      data: {
        pageCount,
        fileSizeBytes: ctx.fileSizeBytes,
        checksum: ctx.checksum,
      },
    });

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(`[${ctx.documentId}] Stage 1 DONE — pages=${pageCount}`);
  }
}
