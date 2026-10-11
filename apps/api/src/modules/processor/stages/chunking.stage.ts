import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import type { PipelineContext, DocumentChunkData } from './pipeline-context';
import type { DocumentProcessingJobData } from './pipeline-context';

const TARGET_CHUNK_MIN_TOKENS = 300;
const TARGET_CHUNK_MAX_TOKENS = 600;

/**
 * Hard ceiling for a single chunk. Embedding providers reject oversized
 * inputs (text-embedding-3-small caps at 8191 tokens), so no chunk may exceed
 * this no matter how the source text is laid out.
 */
const HARD_MAX_CHUNK_TOKENS = 1000;

/** Minimum content length for a chunk to be worth storing. */
const MIN_CHUNK_CHARS = 20;

/**
 * Stage 12: CHUNKING
 *
 * Splits normalized OCR text into semantically meaningful chunks.
 * Strategy:
 * 1. Split into blocks on blank lines, falling back to single newlines and
 *    then sentence boundaries when the text has no blank lines at all —
 *    which is the common case for OCR output and for PDF text-layer
 *    extraction, where a whole page arrives as one unbroken run of text.
 * 2. Detect headings: ALL-CAPS lines or lines ending with ":"
 * 3. Target chunk size: 300–600 tokens, hard-capped at HARD_MAX_CHUNK_TOKENS
 * 4. Prefer sentence boundaries; split on words only as a last resort
 *
 * Uses a word-based token approximation to avoid shipping the full tiktoken
 * WASM. Can be upgraded to tiktoken in production.
 */
@Injectable()
export class ChunkingStage extends BaseStage {
  protected readonly stageName = ProcessingStage.CHUNKING;
  protected readonly logger = new Logger(ChunkingStage.name);

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * Stage 13 embeds ctx.chunks and pairs them positionally with ctx.chunkIds,
   * so both must come back together and in chunkIndex order.
   */
  async rehydrate(ctx: PipelineContext): Promise<void> {
    if (ctx.chunkIds && ctx.chunks) return;

    const rows = await this.db.documentChunk.findMany({
      where: { versionId: ctx.versionId },
      select: {
        id: true,
        chunkIndex: true,
        content: true,
        pageNumber: true,
        sectionTitle: true,
        tokenCount: true,
        charCount: true,
        language: true,
      },
      orderBy: { chunkIndex: 'asc' },
    });

    ctx.chunkIds = rows.map((c) => c.id);
    ctx.chunks = rows.map((c) => ({
      chunkIndex: c.chunkIndex,
      content: c.content,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle ?? undefined,
      tokenCount: c.tokenCount,
      charCount: c.charCount,
      language: c.language ?? undefined,
    }));

    this.logger.debug(
      `[${ctx.documentId}] Rehydrated ${ctx.chunkIds.length} chunks (with content) from DB`,
    );
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 12: CHUNKING`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 78);

    const ocrResults = ctx.ocrResults ?? [];
    if (ocrResults.length === 0) {
      ctx.chunks = [];
      ctx.chunkIds = [];
      this.markStageCompleted(ctx.versionId, ctx);
      return;
    }

    // Delete existing chunks (idempotency)
    await this.db.documentChunk.deleteMany({ where: { versionId: ctx.versionId } });

    const allChunks: DocumentChunkData[] = [];
    let chunkIndex = 0;

    // Sort a copy — ocrResults is shared via ctx and sorting in place would
    // reorder it under the stages that read it later.
    const orderedPages = [...ocrResults].sort((a, b) => a.pageNumber - b.pageNumber);

    for (const page of orderedPages) {
      if (!page.rawText.trim()) continue;

      const pageChunks = this.chunkText(page.rawText, page.pageNumber, chunkIndex);
      // Carry the detected language through so search can filter on it.
      for (const chunk of pageChunks) {
        chunk.language = chunk.language ?? page.pageLanguage ?? ctx.primaryLanguage;
      }
      allChunks.push(...pageChunks);
      chunkIndex += pageChunks.length;
    }

    if (allChunks.length === 0) {
      const totalChars = ocrResults.reduce((s, r) => s + r.rawText.length, 0);
      this.logger.warn(
        `[${ctx.documentId}] Stage 12: produced 0 chunks from ${ocrResults.length} pages ` +
        `(${totalChars} OCR chars) — this document will not be searchable`,
      );
    }

    // Bulk insert all chunks in one query instead of N sequential creates
    await this.db.documentChunk.createMany({
      data: allChunks.map((chunk) => ({
        versionId: ctx.versionId,
        documentId: ctx.documentId,
        chunkIndex: chunk.chunkIndex,
        content: (chunk.content ?? '').replace(/\0/g, ''),
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle ? chunk.sectionTitle.replace(/\0/g, '') : null,
        tokenCount: chunk.tokenCount,
        charCount: chunk.charCount,
        language: chunk.language ?? null,
      })),
    });

    // Retrieve the inserted IDs in chunkIndex order — Stage 13 pairs
    // ctx.chunks[i] with ctx.chunkIds[i] positionally, so this ordering must
    // match allChunks exactly.
    const insertedChunks = await this.db.documentChunk.findMany({
      where: { versionId: ctx.versionId },
      orderBy: { chunkIndex: 'asc' },
      select: { id: true },
    });
    const chunkIds = insertedChunks.map((c) => c.id);

    if (chunkIds.length !== allChunks.length) {
      throw new Error(
        `CHUNK_PERSIST_MISMATCH: built ${allChunks.length} chunks but read back ${chunkIds.length} for version ${ctx.versionId}`,
      );
    }

    ctx.chunks = allChunks;
    ctx.chunkIds = chunkIds;

    this.markStageCompleted(ctx.versionId, ctx);
    const avgTokens = allChunks.length > 0
      ? Math.round(allChunks.reduce((s, c) => s + c.tokenCount, 0) / allChunks.length)
      : 0;
    this.logger.log(
      `[${ctx.documentId}] Stage 12 DONE — ${allChunks.length} chunks | avgTokens=${avgTokens} | ids=${chunkIds.length}`,
    );
    if (allChunks.length > 0) {
      const chunkLines = allChunks.map((c, i) =>
        `  [${i}] page=${c.pageNumber} | tokens=${c.tokenCount} | chars=${c.charCount}` +
        (c.sectionTitle ? ` | section="${c.sectionTitle}"` : '') +
        ` | "${c.content.replace(/\n/g, ' ').substring(0, 60)}..."`
      );
      this.logger.debug(
        `[${ctx.documentId}] Stage 12 CHUNK BREAKDOWN:\n` + chunkLines.join('\n'),
      );
    }
  }

  /**
   * Split page text into chunks, respecting heading and paragraph boundaries.
   */
  private chunkText(
    text: string,
    pageNumber: number,
    startIndex: number,
  ): DocumentChunkData[] {
    const blocks = this.splitIntoBlocks(text);
    const chunks: DocumentChunkData[] = [];
    let currentContent = '';
    let currentSection: string | undefined;
    let chunkIdx = startIndex;

    const push = (content: string, sectionTitle?: string) => {
      const trimmed = content.trim();
      if (trimmed.length < MIN_CHUNK_CHARS) return; // too short to be meaningful

      chunks.push({
        chunkIndex: chunkIdx++,
        content: trimmed,
        pageNumber,
        sectionTitle,
        tokenCount: this.estimateTokens(trimmed),
        charCount: trimmed.length,
      });
    };

    const flush = () => {
      const content = currentContent.trim();
      currentContent = '';
      if (!content) return;

      // A block can be larger than the hard cap on its own (a dense page with
      // no blank lines, for instance), so enforce the cap here — this is the
      // last point before the text reaches the embedding provider.
      for (const piece of this.enforceHardLimit(content)) {
        push(piece, currentSection);
      }
    };

    for (const block of blocks) {
      if (this.isHeading(block)) {
        // Flush current content before starting new section
        flush();
        currentSection = block;
        // Keep the heading in the body text too. It is often the single most
        // searchable line on the page (a notice subject, an invoice label),
        // and a heading consumed only as a section title never reaches the
        // embeddings or the full-text index.
        currentContent = block;
        continue;
      }

      const combined = currentContent ? currentContent + '\n\n' + block : block;
      const tokens = this.estimateTokens(combined);

      if (tokens > TARGET_CHUNK_MAX_TOKENS && currentContent) {
        // Adding this block would overflow — close the current chunk first.
        flush();
        currentContent = block;
        // The block alone may still be over target; flush it immediately so
        // enforceHardLimit splits it instead of letting it keep growing.
        if (this.estimateTokens(block) >= TARGET_CHUNK_MAX_TOKENS) {
          flush();
        }
      } else {
        currentContent = combined;
        // Auto-flush once we are within the target band
        if (tokens >= TARGET_CHUNK_MIN_TOKENS) {
          flush();
        }
      }
    }

    // Flush remainder
    flush();

    return chunks;
  }

  /**
   * Break page text into candidate blocks.
   *
   * Blank lines are the best signal, but OCR output and PDF text-layer
   * extraction frequently contain none — `rawText` from the PDF path is a
   * single space-joined run. Splitting only on /\n\n+/ then returned the whole
   * page as one block, which produced one enormous chunk per page and, on a
   * dense page, an input the embedding API rejects outright. So fall back
   * through progressively weaker separators.
   */
  private splitIntoBlocks(text: string): string[] {
    const byBlankLine = text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
    if (byBlankLine.length > 1) return byBlankLine;

    const byLine = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    if (byLine.length > 1) return byLine;

    return this.splitIntoSentences(text);
  }

  /**
   * Split on sentence boundaries, including the Devanagari danda (।) used in
   * Hindi text alongside Western punctuation.
   */
  private splitIntoSentences(text: string): string[] {
    const sentences = text
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return sentences.length > 0 ? sentences : [text.trim()].filter(Boolean);
  }

  /**
   * Guarantee no piece exceeds HARD_MAX_CHUNK_TOKENS, splitting on sentence
   * boundaries where possible and on word boundaries only when a single
   * "sentence" is itself too long (unpunctuated OCR text).
   */
  private enforceHardLimit(content: string): string[] {
    if (this.estimateTokens(content) <= HARD_MAX_CHUNK_TOKENS) return [content];

    const pieces: string[] = [];
    let buffer = '';

    const flushBuffer = () => {
      if (buffer.trim()) pieces.push(buffer.trim());
      buffer = '';
    };

    for (const sentence of this.splitIntoSentences(content)) {
      if (this.estimateTokens(sentence) > HARD_MAX_CHUNK_TOKENS) {
        // Single run of text with no usable punctuation — split by words.
        flushBuffer();
        pieces.push(...this.splitByWords(sentence));
        continue;
      }

      const candidate = buffer ? `${buffer} ${sentence}` : sentence;
      if (this.estimateTokens(candidate) > HARD_MAX_CHUNK_TOKENS) {
        flushBuffer();
        buffer = sentence;
      } else {
        buffer = candidate;
      }
    }

    flushBuffer();
    return pieces.length > 0 ? pieces : [content];
  }

  private splitByWords(text: string): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    // estimateTokens multiplies the word count by 1.3, so invert that to get
    // the number of words that fits under the cap.
    const wordsPerChunk = Math.max(1, Math.floor(HARD_MAX_CHUNK_TOKENS / 1.3));

    const pieces: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      pieces.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return pieces;
  }

  /**
   * Heuristic: a block is a heading if it is a single line under 80 chars that
   * either ends with a colon or is written in all caps.
   *
   * The all-caps test must require an actual uppercase letter. The old test
   * was `line === line.toUpperCase()`, which is true for any string with no
   * cased characters at all — so every short Devanagari line, and every
   * date/number line like "12-08-2026", was classified as a heading. Headings
   * are consumed as section titles rather than emitted as chunk content, so
   * on a Hindi document (or an ID card, where every line is short) this
   * dropped most of the text out of the chunks and out of search entirely.
   */
  private isHeading(para: string): boolean {
    const lines = para.split('\n');
    if (lines.length !== 1) return false;
    const line = lines[0]!.trim();
    if (line.length > 80) return false;
    if (line.endsWith(':')) return true;
    const hasUpper = /\p{Lu}/u.test(line);
    const hasLower = /\p{Ll}/u.test(line);
    return line.length > 3 && hasUpper && !hasLower;
  }

  /**
   * Approximate token count: words × 1.3 (accounts for sub-word tokens).
   * Conservative estimate — real tiktoken would be more accurate.
   */
  private estimateTokens(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.round(words * 1.3);
  }
}
