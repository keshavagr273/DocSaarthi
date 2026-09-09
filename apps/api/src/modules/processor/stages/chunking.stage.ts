import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import type { PipelineContext, DocumentChunkData } from './pipeline-context';
import type { DocumentProcessingJobData } from '../document.processor';

const TARGET_CHUNK_MIN_TOKENS = 300;
const TARGET_CHUNK_MAX_TOKENS = 600;

/**
 * Stage 12: CHUNKING
 *
 * Splits normalized OCR text into semantically meaningful chunks.
 * Strategy:
 * 1. Split on double newlines (paragraph boundaries)
 * 2. Detect headings: ALL-CAPS lines or lines ending with ":"
 * 3. Target chunk size: 300–600 tokens
 * 4. Never split mid-sentence
 *
 * Uses simple word-based token approximation (~0.75 tokens per word) to avoid
 * shipping the full tiktoken WASM. Can be upgraded to tiktoken in production.
 */
@Injectable()
export class ChunkingStage extends BaseStage {
  protected readonly stageName = ProcessingStage.CHUNKING;
  protected readonly logger = new Logger(ChunkingStage.name);

  constructor(db: DatabaseService) {
    super(db);
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

    for (const page of ocrResults.sort((a, b) => a.pageNumber - b.pageNumber)) {
      if (!page.rawText.trim()) continue;

      const pageChunks = this.chunkText(page.rawText, page.pageNumber, chunkIndex);
      allChunks.push(...pageChunks);
      chunkIndex += pageChunks.length;
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

    // Retrieve the inserted IDs in order
    const insertedChunks = await this.db.documentChunk.findMany({
      where: { versionId: ctx.versionId },
      orderBy: { chunkIndex: 'asc' },
      select: { id: true },
    });
    const chunkIds = insertedChunks.map((c) => c.id);

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
    const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const chunks: DocumentChunkData[] = [];
    let currentContent = '';
    let currentSection: string | undefined;
    let chunkIdx = startIndex;

    const flush = (forceSection?: string) => {
      const content = currentContent.trim();
      if (content.length < 20) return; // too short to be meaningful

      const tokenCount = this.estimateTokens(content);
      chunks.push({
        chunkIndex: chunkIdx++,
        content,
        pageNumber,
        sectionTitle: forceSection ?? currentSection,
        tokenCount,
        charCount: content.length,
      });
      currentContent = '';
    };

    for (const para of paragraphs) {
      const isHeading = this.isHeading(para);

      if (isHeading) {
        // Flush current content before starting new section
        flush();
        currentSection = para;
        continue;
      }

      const combined = currentContent ? currentContent + '\n\n' + para : para;
      const tokens = this.estimateTokens(combined);

      if (tokens > TARGET_CHUNK_MAX_TOKENS && currentContent) {
        // Current chunk is full — flush and start new
        flush();
        currentContent = para;
      } else {
        currentContent = combined;
        // Auto-flush when approaching max
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
   * Heuristic: a paragraph is a heading if:
   * - It's a single line
   * - It's all-caps
   * - It ends with a colon
   * - It's < 80 chars
   */
  private isHeading(para: string): boolean {
    const lines = para.split('\n');
    if (lines.length !== 1) return false;
    const line = lines[0]!.trim();
    if (line.length > 80) return false;
    if (line.endsWith(':')) return true;
    if (line === line.toUpperCase() && line.length > 3) return true;
    return false;
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
