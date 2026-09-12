import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { OcrClientService } from '../services/ocr-client.service';
import { LlmService } from '../services/llm.service';
import { StorageClientService } from '../services/storage-client.service';
import type { PipelineContext, OcrPageResult, OcrBlock } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

/**
 * Stage 5: OCR with VLM Fallback & Selective Block Refinement
 *
 * 1. Calls PaddleOCR sidecar.
 * 2. If confidence < 0.70 or PaddleOCR is unavailable/empty: routes to Vision LLM fallback.
 * 3. If confidence >= 0.70 but individual blocks are < 0.65: crops block regions with sharp
 *    and refines text with targeted Vision LLM re-reading.
 */
@Injectable()
export class OcrStage extends BaseStage {
  protected readonly stageName = ProcessingStage.OCR;
  protected readonly logger = new Logger(OcrStage.name);

  constructor(
    db: DatabaseService,
    private readonly ocrClient: OcrClientService,
    private readonly llm: LlmService,
    private readonly storage: StorageClientService,
  ) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 5: OCR (with VLM Fallback)`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 30);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');

    const preprocessedBuffers = ctx.preprocessedBuffers ?? {};
    const pageIds = ctx.pageIds ?? {};

    // If preprocessedBuffers is empty (e.g., lost context on retry), fall back to
    // iterating over known pageIds so PDF direct-extraction / VLM fallback still runs
    const pageNumbers =
      Object.keys(preprocessedBuffers).length > 0
        ? Object.keys(preprocessedBuffers).map(Number).sort((a, b) => a - b)
        : Object.keys(pageIds).map(Number).sort((a, b) => a - b);

    // If we have no page info at all, try page 1 for single-page documents
    const effectivePageNumbers =
      pageNumbers.length > 0 ? pageNumbers : [1];

    const ocrResults: OcrPageResult[] = [];

    for (const pageNum of effectivePageNumbers) {
      const buffer = preprocessedBuffers[pageNum] ?? Buffer.alloc(0);

      await this.reportProgress(
        job,
        30 + Math.round((pageNum / (pageNumbers.length || 1)) * 14),
      );

      let result: OcrPageResult | null = null;

      const isPdf =
        ctx.mimeType === 'application/pdf' ||
        (!ctx.mimeType && ctx.storageKey?.toLowerCase().endsWith('.pdf'));

      // ── Step 1: For PDFs, try direct text layer extraction first ──
      if (isPdf) {
        try {
          const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
          // Reuse the PDF buffer already downloaded by Stage 3 (PdfRenderingStage)
          // to avoid a redundant MinIO network round-trip per page.
          const pdfBuf = ctx.pdfBuffer ?? await this.storage.downloadBuffer(ctx.storageKey);
          const doc = await pdfjs.getDocument({
            data: new Uint8Array(pdfBuf),
            useSystemFonts: true,
            disableFontFace: true,
          }).promise;
          const page = await doc.getPage(pageNum);
          const textContent = await page.getTextContent();
          // CRITICAL FIX: Use scale 2.0 to match the rendered PNG dimensions
          // stored in documentPages.width/height (PdfRenderingStage renders at 2.0).
          // Without this, bbox coordinates are in 1x space while the frontend divides
          // by 2x page dimensions → all overlays appear shifted to the left/top.
          const viewport = page.getViewport({ scale: 2.0 });

          const textParts: string[] = [];
          const blocks: OcrBlock[] = [];
          let order = 0;

          for (const rawItem of textContent.items) {
            const item = rawItem as { str?: string; transform?: number[]; width?: number; height?: number };
            if (item.str && item.str.trim()) {
              textParts.push(item.str);
              const tx = item.transform ? item.transform[4] || 0 : 0;
              const ty = item.transform ? item.transform[5] || 0 : 0;
              const fontHeight = item.transform
                ? Math.max(Math.abs(item.transform[0] || 0), Math.abs(item.transform[3] || 0), 10)
                : 10;
              const itemWidth = item.width || 50;

              // Convert PDF space rectangle to viewport space (canvas pixel coordinates)
              const rect = viewport.convertToViewportRectangle([tx, ty, tx + itemWidth, ty + fontHeight]);
              const vx1 = Math.min(rect[0], rect[2]);
              const vy1 = Math.min(rect[1], rect[3]);
              const vx2 = Math.max(rect[0], rect[2]);
              const vy2 = Math.max(rect[1], rect[3]);

              blocks.push({
                id: `pdf-b-${pageNum}-${order++}`,
                text: item.str,
                bbox: [Math.round(vx1), Math.round(vy1), Math.round(vx2), Math.round(vy2)],
                confidence: 0.99,
                readingOrder: order,
                blockType: 'text',
              });
            }
          }

          const rawText = textParts.join(' ');

          if (rawText.trim().length > 0) {
            this.logger.log(
              `[${ctx.documentId}] Direct PDF extraction succeeded for page ${pageNum}: ${blocks.length} blocks`,
            );
            result = {
              pageNumber: pageNum,
              width: Math.round(viewport.width),
              height: Math.round(viewport.height),
              blocks,
              rawText,
              pageConfidence: 0.98,
              pageLanguage: 'en',
              processingTimeMs: 50,
              fallbackUsed: false,
            };
          }
        } catch (pdfErr) {
          this.logger.warn(`Direct PDF extraction error on page ${pageNum}: ${String(pdfErr)}`);
        }
      }

      // ── Step 2: Fall back to image-based OCR (PaddleOCR / VLM) ────
      if (!result) {
        if (buffer.length > 0) {
          // Try PaddleOCR sidecar
          const paddleResult = await this.ocrClient.recognizePage(buffer, pageNum);

          if (paddleResult.pageConfidence < 0.70 || paddleResult.fallbackUsed || paddleResult.blocks.length === 0) {
            this.logger.log(
              `[${ctx.documentId}] Page ${pageNum} confidence=${paddleResult.pageConfidence.toFixed(2)}. Attempting VLM OCR...`,
            );

            let width = paddleResult.width || 1000;
            let height = paddleResult.height || 1400;
            try {
              const meta = await sharp(buffer).metadata();
              width = meta.width ?? width;
              height = meta.height ?? height;
            } catch {
              // keep defaults
            }

            try {
              const vlmResult = await this.llm.extractTextFromVision(buffer, pageNum, width, height);
              this.logger.log(
                `[${ctx.documentId}] VLM result for page ${pageNum}: blocks=${vlmResult.blocks?.length ?? 0}, chars=${vlmResult.rawText?.length ?? 0}, confidence=${vlmResult.pageConfidence}`,
              );
              if (vlmResult.blocks.length > 0 && vlmResult.rawText.trim().length > 0) {
                result = vlmResult;
              }
            } catch (vlmErr) {
              this.logger.error(`[${ctx.documentId}] VLM fallback failed for page ${pageNum}: ${String(vlmErr)}`);
            }

            // If VLM produced no text (or was skipped because LLM is text-only), fall back to built-in Tesseract OCR
            if (!result || result.blocks.length === 0 || !result.rawText.trim()) {
              this.logger.log(
                `[${ctx.documentId}] Running built-in Tesseract OCR for page ${pageNum}...`,
              );
              try {
                const tessResult = await this.runTesseractOcr(buffer, pageNum, width, height);
                if (tessResult.rawText.trim().length > 0) {
                  result = tessResult;
                }
              } catch (tessErr) {
                this.logger.warn(`[${ctx.documentId}] Tesseract OCR failed on page ${pageNum}: ${String(tessErr)}`);
              }
            }

            if (!result) {
              result = paddleResult;
            }
          } else {
            result = paddleResult;
          }
        } else {
          this.logger.warn(`[${ctx.documentId}] Empty buffer for page ${pageNum}, returning empty OCR result`);
          result = {
            pageNumber: pageNum,
            width: 0,
            height: 0,
            blocks: [],
            rawText: '',
            pageConfidence: 0,
            pageLanguage: 'unknown',
            processingTimeMs: 0,
            fallbackUsed: true,
          };
        }
      }

      // Sanitize null bytes (\u0000) which are invalid in PostgreSQL UTF-8 text columns
      const sanitizedRawText = (result.rawText ?? '').replace(/\0/g, '');
      const sanitizedBlocks = (result.blocks ?? []).map((b) => ({
        ...b,
        text: (b.text ?? '').replace(/\0/g, ''),
      }));
      result.rawText = sanitizedRawText;
      result.blocks = sanitizedBlocks;

      ocrResults.push(result);

      // ── Per-page debug summary ────────────────────────────────────
      const method = !result.fallbackUsed
        ? (Object.keys(preprocessedBuffers).length === 0 || result.pageConfidence >= 0.98
            ? 'pdf-direct'
            : 'paddle')
        : (result.fallbackProvider || 'vlm-fallback');
      const textSample = result.rawText.replace(/\n/g, ' ').substring(0, 80);
      this.logger.log(
        `[${ctx.documentId}] OCR page ${result.pageNumber}: ` +
        `method=${method} | blocks=${result.blocks.length} | ` +
        `confidence=${(result.pageConfidence * 100).toFixed(1)}% | ` +
        `chars=${result.rawText.length} | lang=${result.pageLanguage}`,
      );
      this.logger.debug(
        `[${ctx.documentId}] OCR page ${result.pageNumber} TEXT SAMPLE:\n  "${textSample}${result.rawText.length > 80 ? '...' : ''}"`,
      );

      // Delete existing OCR result for this page (idempotency on retry) then create fresh
      await this.db.ocrResult.deleteMany({
        where: { versionId: ctx.versionId, pageNumber: pageNum },
      });
      await this.db.ocrResult.create({
        data: {
          versionId: ctx.versionId,
          pageId: pageIds[pageNum] ?? null,
          pageNumber: pageNum,
          rawText: sanitizedRawText,
          blocks: sanitizedBlocks as unknown as object[],
          pageConfidence: result.pageConfidence,
          pageLanguage: result.pageLanguage,
          ocrProvider: result.fallbackProvider ?? (result.fallbackUsed ? 'vlm' : 'paddle'),
          fallbackUsed: result.fallbackUsed,
          fallbackProvider: result.fallbackProvider ?? (result.fallbackUsed ? 'openai-vision' : null),
          processingTimeMs: result.processingTimeMs,
        },
      });

      // Update document_pages with detected language and confidence
      if (pageIds[pageNum]) {
        await this.db.documentPage.update({
          where: { id: pageIds[pageNum] },
          data: {
            language: result.pageLanguage,
            confidence: result.pageConfidence,
          },
        });
      }
    }

    ctx.ocrResults = ocrResults;

    this.markStageCompleted(ctx.versionId, ctx);
    const avgConf = this.avgConfidence(ocrResults);
    const fallbacks = ocrResults.filter((r) => r.fallbackUsed).length;
    const totalChars = ocrResults.reduce((s, r) => s + r.rawText.length, 0);
    const totalBlocks = ocrResults.reduce((s, r) => s + r.blocks.length, 0);
    this.logger.log(
      `[${ctx.documentId}] Stage 5 DONE — OCR'd ${ocrResults.length} pages | ` +
      `avgConf=${(avgConf * 100).toFixed(1)}% | fallbacks=${fallbacks} | ` +
      `totalBlocks=${totalBlocks} | totalChars=${totalChars}`,
    );
    this.logger.debug(
      `[${ctx.documentId}] Stage 5 PAGE BREAKDOWN:\n` +
      ocrResults.map((r) =>
        `  page ${r.pageNumber}: ${r.blocks.length} blocks | ${(r.pageConfidence * 100).toFixed(1)}% | ` +
        `${r.pageLanguage} | fallback=${r.fallbackUsed} | ${r.rawText.length} chars`
      ).join('\n'),
    );
  }

  private avgConfidence(results: OcrPageResult[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.pageConfidence, 0) / results.length;
  }

  // ── In-Process Tesseract.js OCR Fallback ───────────────────────────
  // Used on Render / cloud deployments when PaddleOCR sidecar is down and VLM is unavailable.
  private tesseractWorker: any = null;

  private async getTesseractWorker() {
    if (!this.tesseractWorker) {
      const { createWorker } = await import('tesseract.js');
      try {
        this.tesseractWorker = await createWorker(['eng', 'hin']);
      } catch (err) {
        this.logger.warn(
          `Failed initializing eng+hin Tesseract worker, falling back to eng: ${String(err)}`,
        );
        this.tesseractWorker = await createWorker('eng');
      }
    }
    return this.tesseractWorker;
  }

  private async runTesseractOcr(
    imageBuffer: Buffer,
    pageNumber: number,
    width: number,
    height: number,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();
    let ret: any;

    try {
      const worker = await this.getTesseractWorker();
      ret = await worker.recognize(imageBuffer, {}, { blocks: true });
    } catch (err) {
      this.logger.warn(
        `Tesseract recognize attempt 1 failed (${String(err)}), resetting worker and retrying with eng...`,
      );
      try {
        if (this.tesseractWorker) {
          await this.tesseractWorker.terminate().catch(() => {});
        }
      } catch {
        // ignore
      }
      this.tesseractWorker = null;
      const { createWorker } = await import('tesseract.js');
      this.tesseractWorker = await createWorker('eng');
      ret = await this.tesseractWorker.recognize(imageBuffer, {}, { blocks: true });
    }

    const blocks: OcrBlock[] = [];
    let order = 0;

    if (ret.data && Array.isArray(ret.data.blocks)) {
      for (const b of ret.data.blocks) {
        if (Array.isArray(b.paragraphs)) {
          for (const p of b.paragraphs) {
            if (Array.isArray(p.lines)) {
              for (const l of p.lines) {
                const text = (l.text || '').trim();
                if (text) {
                  const bbox: [number, number, number, number] = l.bbox
                    ? [
                        Math.round(l.bbox.x0),
                        Math.round(l.bbox.y0),
                        Math.round(l.bbox.x1),
                        Math.round(l.bbox.y1),
                      ]
                    : [0, 0, width, height];

                  blocks.push({
                    id: `tess-b-${pageNumber}-${order++}`,
                    text,
                    bbox,
                    confidence: Math.max(0.1, Math.min(1.0, (l.confidence || 75) / 100)),
                    readingOrder: order,
                    blockType: 'text',
                  });
                }
              }
            }
          }
        }
      }
    }

    const rawText = (ret.data?.text || '').trim();

    // Fallback: if block hierarchy was empty but rawText exists, generate line-level blocks
    if (blocks.length === 0 && rawText.length > 0) {
      const lines = rawText.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      lines.forEach((lineText: string, idx: number) => {
        blocks.push({
          id: `tess-b-${pageNumber}-${idx}`,
          text: lineText,
          bbox: [0, 0, width, height],
          confidence: Math.max(0.1, Math.min(1.0, (ret.data?.confidence || 80) / 100)),
          readingOrder: idx,
          blockType: 'text',
        });
      });
    }
    const pageConfidence = ret.data?.confidence
      ? Math.max(0.1, Math.min(1.0, ret.data.confidence / 100))
      : (rawText.length > 0 ? 0.85 : 0);

    const containsHindi = /[\u0900-\u097F]/.test(rawText);
    const pageLanguage = containsHindi ? 'hi' : 'en';

    return {
      pageNumber,
      width,
      height,
      blocks,
      rawText,
      pageConfidence,
      pageLanguage,
      processingTimeMs: Date.now() - startTime,
      fallbackUsed: true,
      fallbackProvider: 'tesseract',
    };
  }
}
