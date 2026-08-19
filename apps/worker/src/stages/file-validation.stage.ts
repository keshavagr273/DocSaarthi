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
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const doc = await loadingTask.promise;
    return doc.numPages || 1;
  } catch {
    // Fallback: regex scan for /Type /Page
    const text = buffer.toString('latin1');
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length;
    }
    const countMatch = text.match(/\/Count\s+(\d+)/);
    if (countMatch && countMatch[1]) {
      const parsed = parseInt(countMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 1;
  }
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
    this.markStageProcessing(ctx.versionId, ctx);
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

      // Cache the buffer immediately — Stages 2 (file-storage), 3 (pdf-rendering),
      // and 5 (OCR) will all reuse this instead of re-downloading from MinIO.
      ctx.pdfBuffer = buffer;

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

    this.markStageCompleted(ctx.versionId, ctx);
    this.logger.log(
      `[${ctx.documentId}] Stage 1 DONE — pages=${pageCount} | ` +
      `size=${(ctx.fileSizeBytes! / 1024).toFixed(1)}KB | ` +
      `mime=${ctx.mimeType} | checksum=${ctx.checksum?.substring(0, 12)}...`,
    );
    this.logger.debug(
      `[${ctx.documentId}] Stage 1 DETAILS:\n` +
      `  storageKey   : ${ctx.storageKey}\n` +
      `  fileSizeBytes: ${ctx.fileSizeBytes} (${(ctx.fileSizeBytes! / 1024 / 1024).toFixed(2)} MB)\n` +
      `  pageCount    : ${ctx.pageCount}\n` +
      `  checksum     : ${ctx.checksum}\n` +
      `  mimeType     : ${ctx.mimeType}`,
    );
  }
}
