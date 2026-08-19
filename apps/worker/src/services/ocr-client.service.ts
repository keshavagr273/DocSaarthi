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
@Injectable()
export class OcrClientService {
  private readonly logger = new Logger(OcrClientService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs = 120_000; // 2 minutes per page

  constructor() {
    this.baseUrl = process.env['OCR_PADDLE_URL'] ?? 'http://localhost:8081';
  }

  /**
   * Run OCR on a single page image (as a Buffer).
   * Returns a structured OcrPageResult.
   */
  async recognizePage(
    imageBuffer: Buffer,
    pageNumber: number,
  ): Promise<OcrPageResult> {
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

      const blocks: OcrBlock[] = data.blocks.map((b) => ({
        id: b.id,
        text: b.text,
        bbox: b.bbox,
        confidence: b.confidence,
        readingOrder: b.reading_order,
        blockType: b.block_type,
      }));

      return {
        pageNumber: data.page_number,
        width: data.width,
        height: data.height,
        blocks,
        rawText: data.raw_text,
        pageConfidence: data.page_confidence,
        pageLanguage: data.page_language,
        processingTimeMs: data.processing_time_ms,
        fallbackUsed: false,
      };
    } catch (err) {
      this.logger.warn(
        `PaddleOCR sidecar unavailable for page ${pageNumber}: ${String(err)}. Using fallback.`,
      );
      return this.fallbackOcr(imageBuffer, pageNumber);
    }
  }

  /**
   * Check if the sidecar is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: 5000 });
      return res.status === 200;
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
    };
  }
}
