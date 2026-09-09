import type { Job } from 'bull';

export interface DocumentProcessingJobData {
  documentId: string;
  versionId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
  requestId?: string;
}

/**
 * OcrBlock — a single text block from PaddleOCR or fallback.
 */
export interface OcrBlock {
  id: string;
  text: string;
  /** Flat [x1, y1, x2, y2] bounding box */
  bbox: [number, number, number, number];
  confidence: number;
  readingOrder: number;
  blockType: string;
}

/**
 * OcrPageResult — OCR output for a single page.
 */
export interface OcrPageResult {
  pageNumber: number;
  width: number;
  height: number;
  blocks: OcrBlock[];
  rawText: string;
  pageConfidence: number;
  pageLanguage: string;
  processingTimeMs: number;
  fallbackUsed: boolean;
}

/**
 * ExtractedField — a single structured field from LLM extraction.
 */
export interface ExtractedField {
  fieldName: string;
  fieldType: 'TEXT' | 'DATE' | 'NUMBER' | 'CURRENCY' | 'LIST' | 'BOOLEAN' | 'ADDRESS' | 'NAME' | 'ID_NUMBER';
  rawValue: string;
  normalizedValue?: unknown;
  confidence: number;
  sourcePage?: number;
  extractionMethod?: string;
}

/**
 * DocumentChunkData — prepared chunk before DB insertion.
 */
export interface DocumentChunkData {
  chunkIndex: number;
  content: string;
  pageNumber: number;
  sectionTitle?: string;
  tokenCount: number;
  charCount: number;
  language?: string;
}

/**
 * PipelineContext — shared state object passed through all 15 stages.
 *
 * Stages read from and write into this context.
 * This avoids round-trips back to the database for data that was just computed.
 */
export interface PipelineContext {
  // ── Identity ─────────────────────────────────────────────────────
  documentId: string;
  versionId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
  requestId?: string;

  /**
   * In-memory cache of stageHistory entries.
   * Populated lazily from DB on first isAlreadyCompleted check, then
   * maintained in memory for all subsequent stage marker calls.
   * This eliminates the read-modify-write DB pattern in BaseStage.
   */
  stageHistory?: Array<{
    stage: string;
    status: string;
    timestamp: string;
    errorCode?: string;
    errorMessage?: string;
    startedAt?: string;
    completedAt?: string;
  }>;

  // ── Stage 1: FILE_VALIDATION ─────────────────────────────────────
  pageCount?: number;
  fileSizeBytes?: number;
  checksum?: string;

  // ── Stage 2: FILE_STORAGE ────────────────────────────────────────
  thumbnailStorageKey?: string;

  // ── Stage 3: PDF_RENDERING ───────────────────────────────────────
  /** IDs of created document_pages rows, keyed by pageNumber */
  pageIds?: Record<number, string>;
  /** Storage keys for rendered page PNGs, keyed by pageNumber */
  pageStorageKeys?: Record<number, string>;
  /**
   * Raw PDF buffer downloaded from MinIO during Stage 3.
   * Stored here so Stage 5 (OCR) can reuse it without a redundant MinIO fetch.
   */
  pdfBuffer?: Buffer;

  // ── Stage 4: IMAGE_PREPROCESSING ────────────────────────────────
  /** Preprocessed image buffers in memory, keyed by pageNumber */
  preprocessedBuffers?: Record<number, Buffer>;

  // ── Stage 5: OCR ─────────────────────────────────────────────────
  ocrResults?: OcrPageResult[];

  // ── Stage 6: LANGUAGE_DETECTION ──────────────────────────────────
  primaryLanguage?: string;
  secondaryLanguages?: string[];

  // ── Stage 7: DOCUMENT_CLASSIFICATION ────────────────────────────
  category?: string;
  categoryConfidence?: number;

  // ── Stage 8: TEXT_NORMALIZATION ──────────────────────────────────
  normalizedText?: string; // All pages concatenated, normalized

  // ── Stage 9: STRUCTURED_EXTRACTION ──────────────────────────────
  extractedFields?: ExtractedField[];

  // ── Stage 10: CONFIDENCE_SCORING ─────────────────────────────────
  // (enriches extractedFields in place)

  // ── Stage 11: VALIDATION ─────────────────────────────────────────
  // (further enriches extractedFields in place)

  // ── Stage 12: CHUNKING ────────────────────────────────────────────
  chunks?: DocumentChunkData[];
  /** IDs of created document_chunks rows, in order */
  chunkIds?: string[];

  // ── Stage 13: EMBEDDING ──────────────────────────────────────────
  /** Embeddings parallel to chunkIds */
  embeddings?: Float32Array[];

  // BullMQ job reference for progress reporting
  job?: Job<DocumentProcessingJobData>;
}

/**
 * Create a fresh pipeline context from job data.
 */
export function createPipelineContext(
  data: DocumentProcessingJobData,
  job: Job<DocumentProcessingJobData>,
): PipelineContext {
  return {
    documentId: data.documentId,
    versionId: data.versionId,
    userId: data.userId,
    storageKey: data.storageKey,
    mimeType: data.mimeType,
    requestId: data.requestId,
    job,
  };
}
