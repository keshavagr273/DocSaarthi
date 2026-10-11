import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { OcrClientService } from '../services/ocr-client.service';
import { LlmService } from '../services/llm.service';
import { StorageService } from '../../storage/storage.service';
import type { PipelineContext, OcrPageResult, OcrBlock } from './pipeline-context';
import type { DocumentProcessingJobData } from './pipeline-context';

/** Minimal shape of the tesseract.js results we read. */
interface TesseractLine {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface TesseractResult {
  data?: {
    text?: string;
    confidence?: number;
    blocks?: Array<{ paragraphs?: Array<{ lines?: TesseractLine[] }> }> | null;
  };
}

interface TesseractWorker {
  recognize(
    image: Buffer,
    options?: Record<string, unknown>,
    output?: Record<string, unknown>,
  ): Promise<TesseractResult>;
  terminate(): Promise<unknown>;
}

/**
 * Open a PDF with pdf.js once. The caller owns the returned document and must
 * call destroy() on it.
 */
async function openPdf(buffer: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({
    // Copy the bytes: pdf.js takes ownership of the array it is handed.
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: false,
  }).promise;
}

/**
 * Stage 5: OCR with VLM and Tesseract fallbacks.
 *
 * Per page, in order, stopping at the first source that yields text:
 *  1. The PDF's own text layer, when the document is a PDF.
 *  2. Vision LLM, when OCR_PROVIDER selects it as primary.
 *  3. The PaddleOCR sidecar.
 *  4. Vision LLM, when Paddle's confidence is below OCR_FALLBACK_THRESHOLD,
 *     returned no blocks, or the sidecar was unreachable.
 *  5. In-process Tesseract.js, when the VLM is unavailable or produced nothing.
 */
@Injectable()
export class OcrStage extends BaseStage implements OnModuleDestroy {
  protected readonly stageName = ProcessingStage.OCR;
  protected readonly logger = new Logger(OcrStage.name);

  constructor(
    db: DatabaseService,
    private readonly ocrClient: OcrClientService,
    private readonly llm: LlmService,
    private readonly storage: StorageService,
  ) {
    super(db);
  }

  /**
   * ctx.ocrResults feeds language detection, classification, normalization,
   * confidence scoring and chunking — nearly the whole second half of the
   * pipeline. Restore it from the persisted ocr_results rows.
   */
  async rehydrate(ctx: PipelineContext): Promise<void> {
    if (ctx.ocrResults && ctx.ocrResults.length > 0) return;

    const rows = await this.db.ocrResult.findMany({
      where: { versionId: ctx.versionId },
      orderBy: { pageNumber: 'asc' },
    });

    // Page pixel dimensions are not stored on ocr_results, but downstream
    // consumers (and the frontend overlay) read them from document_pages, so
    // pull them from there rather than reporting 0x0.
    const pages = await this.db.documentPage.findMany({
      where: { versionId: ctx.versionId },
      select: { pageNumber: true, width: true, height: true },
    });
    const dimensions = new Map(
      pages.map((p) => [p.pageNumber, { width: p.width ?? 0, height: p.height ?? 0 }]),
    );

    ctx.ocrResults = rows.map((row) => {
      const dim = dimensions.get(row.pageNumber);
      return {
        pageNumber: row.pageNumber,
        width: dim?.width ?? 0,
        height: dim?.height ?? 0,
        blocks: Array.isArray(row.blocks) ? (row.blocks as unknown as OcrBlock[]) : [],
        rawText: row.rawText ?? '',
        pageConfidence: row.pageConfidence ?? 0,
        pageLanguage: row.pageLanguage ?? 'en',
        processingTimeMs: row.processingTimeMs ?? 0,
        fallbackUsed: row.fallbackUsed ?? false,
        ...(row.fallbackProvider ? { fallbackProvider: row.fallbackProvider } : {}),
      };
    });

    this.logger.debug(
      `[${ctx.documentId}] Rehydrated ${ctx.ocrResults.length} OCR pages from DB`,
    );
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

    const isPdf =
      ctx.mimeType === 'application/pdf' ||
      (!ctx.mimeType && ctx.storageKey?.toLowerCase().endsWith('.pdf'));

    // ── Open the PDF once, not once per page ───────────────────────
    // This used to sit inside the page loop, so an N-page PDF was fully
    // re-parsed N times (and its pdf.js worker never released). For a 100-page
    // document that is 100 full parses of the same bytes.
    let pdfDoc: Awaited<ReturnType<typeof openPdf>> | null = null;
    if (isPdf) {
      try {
        // Reuse the PDF buffer already downloaded by an earlier stage to avoid
        // a redundant MinIO round-trip.
        const pdfBuf = ctx.pdfBuffer ?? (await this.storage.downloadBuffer(ctx.storageKey));
        pdfDoc = await openPdf(pdfBuf);
      } catch (err) {
        this.logger.warn(
          `[${ctx.documentId}] Could not open PDF for direct text extraction: ${String(err)}. Falling back to image OCR.`,
        );
      }
    }

    try {
      for (let pageIdx = 0; pageIdx < effectivePageNumbers.length; pageIdx++) {
        const pageNum = effectivePageNumbers[pageIdx]!;
        const buffer = preprocessedBuffers[pageNum] ?? Buffer.alloc(0);

        // Drive progress off position in the list, not the page number — page
        // numbers can be sparse, which pushed the reported value out of range.
        await this.reportProgress(
          job,
          30 + Math.round(((pageIdx + 1) / effectivePageNumbers.length) * 14),
        );

        let result: OcrPageResult | null = null;

        // ── Step 1: For PDFs, try direct text layer extraction first ──
        if (pdfDoc) {
          try {
            const doc = pdfDoc;
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
                provider: 'pdf-text-layer',
              };
            }
          } catch (pdfErr) {
            this.logger.warn(`Direct PDF extraction error on page ${pageNum}: ${String(pdfErr)}`);
          }
        }

        // ── Step 2: Fall back to image-based OCR (PaddleOCR / VLM) ────
        if (!result) {
          if (buffer.length > 0) {
            const ocrProvider = (process.env['OCR_PROVIDER'] || 'paddle').toLowerCase();
            const fallbackThreshold = Number(process.env['OCR_FALLBACK_THRESHOLD'] ?? 0.75);

            let width = 1000;
            let height = 1400;
            try {
              const meta = await sharp(buffer).metadata();
              width = meta.width ?? width;
              height = meta.height ?? height;
            } catch {
              // keep defaults
            }

            // Direct Vision / VLM routing if configured as primary provider
            if (ocrProvider === 'vision' || ocrProvider === 'vlm' || ocrProvider === 'gemini') {
              this.logger.log(
                `[${ctx.documentId}] Using primary Vision OCR (${ocrProvider}) for page ${pageNum}...`,
              );
              try {
                const vlmResult = await this.llm.extractTextFromVision(buffer, pageNum, width, height);
                if (vlmResult.blocks.length > 0 && vlmResult.rawText.trim().length > 0) {
                  result = vlmResult;
                }
              } catch (vlmErr) {
                this.logger.error(`[${ctx.documentId}] Vision OCR failed for page ${pageNum}: ${String(vlmErr)}`);
              }
            }

            // If not configured for direct vision or vision failed, try PaddleOCR sidecar
            if (!result) {
              const paddleResult = await this.ocrClient.recognizePage(buffer, pageNum);
              width = paddleResult.width || width;
              height = paddleResult.height || height;

              // Trigger VLM fallback if confidence is low, sidecar failed/offline, or very few blocks detected
              const shouldFallbackToVlm =
                paddleResult.pageConfidence < fallbackThreshold ||
                paddleResult.fallbackUsed ||
                paddleResult.blocks.length === 0 ||
                (paddleResult.blocks.length < 5 && buffer.length > 50_000);

              if (shouldFallbackToVlm) {
                this.logger.log(
                  `[${ctx.documentId}] Page ${pageNum} confidence=${paddleResult.pageConfidence.toFixed(2)}, blocks=${paddleResult.blocks.length}. Attempting VLM OCR...`,
                );

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
              provider: 'none',
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
        const method = result.provider ?? (result.fallbackUsed ? 'vision' : 'paddle');
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
            // Record the engine that actually read this page rather than
            // guessing from the fallbackUsed flag, which labelled PDF
            // text-layer extraction as 'paddle'.
            ocrProvider: result.provider ?? (result.fallbackUsed ? 'vision' : 'paddle'),
            fallbackUsed: result.fallbackUsed,
            fallbackProvider: result.fallbackProvider ?? null,
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
    } finally {
      // Release the pdf.js worker and its parsed page cache. Without this the
      // document (and every page object it retains) stayed alive for the whole
      // process lifetime.
      if (pdfDoc) {
        await pdfDoc.destroy().catch(() => {});
      }
    }

    ctx.ocrResults = ocrResults;

    // OCR is the last consumer of the raw PDF bytes and the preprocessed page
    // images. For a 100-page scan at 2x these together run to hundreds of MB,
    // and holding them through the nine remaining stages (which do LLM calls
    // and embeddings) was the largest single contributor to worker memory.
    const releasedBytes =
      (ctx.pdfBuffer?.length ?? 0) +
      Object.values(ctx.preprocessedBuffers ?? {}).reduce((s, b) => s + b.length, 0);
    delete ctx.pdfBuffer;
    delete ctx.preprocessedBuffers;
    if (releasedBytes > 0) {
      this.logger.debug(
        `[${ctx.documentId}] Released ${(releasedBytes / 1024 / 1024).toFixed(1)}MB of page/PDF buffers`,
      );
    }

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
  // Used on Render / cloud deployments when the PaddleOCR sidecar is down and
  // the VLM is unavailable.
  //
  // Held as a promise, not a resolved worker: `if (!worker) worker = await
  // create()` has an await inside the guard, so two concurrent pages both saw
  // null, both created a worker, and one was leaked for the lifetime of the
  // process. Storing the in-flight promise makes the second caller await the
  // first one's worker.
  private tesseractWorker: Promise<TesseractWorker> | null = null;

  /** Serializes recognize() calls — a tesseract.js worker handles one job at a time. */
  private tesseractQueue: Promise<unknown> = Promise.resolve();

  private getTesseractWorker(): Promise<TesseractWorker> {
    if (!this.tesseractWorker) {
      this.tesseractWorker = (async () => {
        const { createWorker } = await import('tesseract.js');
        try {
          return (await createWorker(['eng', 'hin'])) as unknown as TesseractWorker;
        } catch (err) {
          this.logger.warn(
            `Failed initializing eng+hin Tesseract worker, falling back to eng: ${String(err)}`,
          );
          return (await createWorker('eng')) as unknown as TesseractWorker;
        }
      })().catch((err) => {
        // Don't cache a failed initialization — let the next page retry.
        this.tesseractWorker = null;
        throw err;
      });
    }
    return this.tesseractWorker;
  }

  private async terminateTesseractWorker(): Promise<void> {
    const pending = this.tesseractWorker;
    this.tesseractWorker = null;
    if (!pending) return;
    try {
      const worker = await pending;
      await worker.terminate();
    } catch {
      // Already gone or never started.
    }
  }

  /**
   * Release the Tesseract worker when the module shuts down. Each worker owns
   * a child process and its loaded language data (~15MB for eng+hin); leaving
   * it running kept the process alive on shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    await this.terminateTesseractWorker();
  }

  private async runTesseractOcr(
    imageBuffer: Buffer,
    pageNumber: number,
    width: number,
    height: number,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();

    // Queue behind any in-flight recognize call on the shared worker.
    const run = this.tesseractQueue.then(
      () => this.recognizeWithTesseract(imageBuffer),
      () => this.recognizeWithTesseract(imageBuffer),
    );
    this.tesseractQueue = run.catch(() => {});
    const ret = await run;

    return this.toOcrPageResult(ret, pageNumber, width, height, startTime);
  }

  private async recognizeWithTesseract(imageBuffer: Buffer): Promise<TesseractResult> {
    try {
      const worker = await this.getTesseractWorker();
      return await worker.recognize(imageBuffer, {}, { blocks: true });
    } catch (err) {
      this.logger.warn(
        `Tesseract recognize attempt 1 failed (${String(err)}), resetting worker and retrying with eng...`,
      );
      await this.terminateTesseractWorker();

      const { createWorker } = await import('tesseract.js');
      this.tesseractWorker = Promise.resolve(
        (await createWorker('eng')) as unknown as TesseractWorker,
      );
      const worker = await this.tesseractWorker;
      return worker.recognize(imageBuffer, {}, { blocks: true });
    }
  }

  private toOcrPageResult(
    ret: TesseractResult,
    pageNumber: number,
    width: number,
    height: number,
    startTime: number,
  ): OcrPageResult {
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
      provider: 'tesseract',
    };
  }
}
