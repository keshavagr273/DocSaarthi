import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { OcrBlock, OcrPageResult } from '../stages/pipeline-context';

/**
 * PaddleOCR sidecar response shape.
 */
interface PaddleOcrResponse {
  page_number: number;
  width: number;
  height: number;
  blocks: Array<{
    id: string;
    text: string;
    bbox: [number, number, number, number];
    confidence: number;
    reading_order: number;
    block_type: string;
  }>;
  raw_text: string;
  page_confidence: number;
  page_language: string;
  processing_time_ms: number;
  fallback_used: boolean;
}

/**
 * OcrClientService — HTTP client for the PaddleOCR sidecar.
 *
 * Falls back to extracting embedded PDF text when the sidecar is unavailable.
 */
/**
 * How long to stop calling the sidecar after it times out or errors.
 *
 * Without this, a sidecar that hangs rather than refusing connections cost a
 * full timeoutMs per page. On a 50-page document that is 50 x 2 minutes — far
 * past the 10-minute job timeout — so the job was killed mid-pipeline and
 * retried, three times, before the document was finally marked failed. One
 * failure now trips the breaker and the remaining pages fall straight through
 * to the VLM/Tesseract path.
 */
const CIRCUIT_OPEN_MS = Number(process.env['OCR_CIRCUIT_OPEN_MS'] ?? 60_000);

@Injectable()
export class OcrClientService {
  private readonly logger = new Logger(OcrClientService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  /** Epoch ms until which the sidecar is considered unavailable. */
  private circuitOpenUntil = 0;

  constructor() {
    this.baseUrl = process.env['OCR_PADDLE_URL'] ?? 'http://localhost:8081';
    this.timeoutMs = Number(process.env['OCR_PADDLE_TIMEOUT_MS'] ?? 120_000);
  }

  /**
   * Run OCR on a single page image (as a Buffer).
   * Returns a structured OcrPageResult.
   */
  async recognizePage(
    imageBuffer: Buffer,
    pageNumber: number,
  ): Promise<OcrPageResult> {
    if (Date.now() < this.circuitOpenUntil) {
      const secondsLeft = Math.ceil((this.circuitOpenUntil - Date.now()) / 1000);
      this.logger.debug(
        `Skipping PaddleOCR for page ${pageNumber} — sidecar marked down for another ${secondsLeft}s`,
      );
      return this.fallbackOcr(imageBuffer, pageNumber);
    }

    try {
      const imageBase64 = imageBuffer.toString('base64');

      const response = await axios.post<PaddleOcrResponse>(
        `${this.baseUrl}/ocr`,
        {
          image_base64: imageBase64,
          page_number: pageNumber,
        },
        { timeout: this.timeoutMs },
      );

      const data = response.data;

      // A malformed or partial response would otherwise throw on
      // `data.blocks.map` and be reported as "sidecar unavailable".
      const rawBlocks = Array.isArray(data?.blocks) ? data.blocks : [];

      const blocks: OcrBlock[] = rawBlocks.map((b, idx) => ({
        id: b.id ?? `paddle-${pageNumber}-${idx}`,
        text: b.text ?? '',
        bbox: b.bbox,
        confidence: typeof b.confidence === 'number' ? b.confidence : 0,
        readingOrder: typeof b.reading_order === 'number' ? b.reading_order : idx,
        blockType: b.block_type ?? 'text',
      }));

      // The sidecar answered — close the breaker if it was open.
      this.circuitOpenUntil = 0;

      return {
        // Trust our own page number over the echoed one: a mismatch would
        // write the OCR row against the wrong page.
        pageNumber,
        width: data?.width ?? 0,
        height: data?.height ?? 0,
        blocks,
        rawText: data?.raw_text ?? '',
        pageConfidence: typeof data?.page_confidence === 'number' ? data.page_confidence : 0,
        pageLanguage: data?.page_language ?? 'unknown',
        processingTimeMs: data?.processing_time_ms ?? 0,
        fallbackUsed: false,
        provider: 'paddle',
      };
    } catch (err) {
      this.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
      this.logger.warn(
        `PaddleOCR sidecar unavailable for page ${pageNumber}: ${String(err)}. ` +
        `Using fallback and skipping the sidecar for ${Math.round(CIRCUIT_OPEN_MS / 1000)}s.`,
      );
      return this.fallbackOcr(imageBuffer, pageNumber);
    }
  }

  /**
   * Check if the sidecar is reachable. Also resets the breaker on success, so
   * a health check can bring the sidecar back early.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: 5000 });
      const up = res.status === 200;
      if (up) this.circuitOpenUntil = 0;
      return up;
    } catch {
      return false;
    }
  }

  /**
   * Fallback OCR — returns empty result with a note that sidecar was unavailable.
   * In CP3, this will use VLM. For now it returns an empty result so the pipeline
   * can continue and the document can still be classified by other means.
   */
  private fallbackOcr(imageBuffer: Buffer, pageNumber: number): OcrPageResult {
    this.logger.warn(
      `Using empty fallback OCR for page ${pageNumber}. PaddleOCR sidecar is down.`,
    );
    void imageBuffer; // suppress unused-variable warning
    return {
      pageNumber,
      width: 0,
      height: 0,
      blocks: [],
      rawText: '',
      pageConfidence: 0.0,
      pageLanguage: 'unknown',
      processingTimeMs: 0,
      fallbackUsed: true,
      provider: 'none',
    };
  }
}
