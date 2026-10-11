import { ChunkingStage } from './chunking.stage';
import type { DatabaseService } from '@docsaarthi/database';
import type { DocumentChunkData } from './pipeline-context';

/**
 * These tests cover chunkText / isHeading, which are pure. The DB is only
 * touched by execute(), so a bare cast is enough here.
 */
describe('ChunkingStage.chunkText', () => {
  const stage = new ChunkingStage({} as DatabaseService);

  // chunkText and estimateTokens are private; exercise them through a typed
  // view of the instance rather than loosening the class itself.
  const internals = stage as unknown as {
    chunkText(text: string, pageNumber: number, startIndex: number): DocumentChunkData[];
    estimateTokens(text: string): number;
    isHeading(para: string): boolean;
  };

  const HARD_MAX_CHUNK_TOKENS = 1000;

  const words = (count: number, word = 'lorem') =>
    Array.from({ length: count }, () => word).join(' ');

  it('splits a paragraph-structured page on blank lines', () => {
    const text = `${words(60)}\n\n${words(60)}\n\n${words(60)}`;
    const chunks = internals.chunkText(text, 1, 0);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.pageNumber === 1)).toBe(true);
  });

  it('assigns sequential chunk indexes starting at startIndex', () => {
    const text = `${words(400)}\n\n${words(400)}\n\n${words(400)}`;
    const chunks = internals.chunkText(text, 2, 7);

    expect(chunks.map((c) => c.chunkIndex)).toEqual(
      chunks.map((_, i) => 7 + i),
    );
  });

  // Regression: PDF text-layer extraction joins every item with a space, so
  // rawText for a page arrives as one unbroken run with no newlines at all.
  // Splitting only on /\n\n+/ yielded a single chunk per page, and on a dense
  // page that chunk exceeded the embedding provider's input limit.
  it('hard-caps a single unbroken run of text with no newlines', () => {
    const text = words(5000);
    const chunks = internals.chunkText(text, 1, 0);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(internals.estimateTokens(chunk.content)).toBeLessThanOrEqual(
        HARD_MAX_CHUNK_TOKENS,
      );
    }
  });

  it('hard-caps text that has sentence punctuation but no newlines', () => {
    const text = Array.from({ length: 300 }, () => `${words(10)}.`).join(' ');
    const chunks = internals.chunkText(text, 1, 0);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(internals.estimateTokens(chunk.content)).toBeLessThanOrEqual(
        HARD_MAX_CHUNK_TOKENS,
      );
    }
  });

  it('loses no words when hard-splitting', () => {
    const text = words(4000);
    const chunks = internals.chunkText(text, 1, 0);

    const rebuilt = chunks.map((c) => c.content).join(' ').split(/\s+/).filter(Boolean);
    expect(rebuilt).toHaveLength(4000);
  });

  // Regression: short Devanagari lines have no cased characters, so the old
  // `line === line.toUpperCase()` test classified every one of them as a
  // heading. Headings are consumed as section titles, so a Hindi document's
  // text was dropped from the chunks — and therefore from search — entirely.
  it('keeps short Hindi lines as content, not headings', () => {
    const hindiLines = [
      'छात्रवृत्ति सूचना जारी की गई है',
      'अंतिम तिथि पंद्रह अगस्त दो हजार छब्बीस',
      'सभी छात्र आवेदन कर सकते हैं अभी',
    ];
    const text = hindiLines.join('\n');

    for (const line of hindiLines) {
      expect(internals.isHeading(line)).toBe(false);
    }

    const chunks = internals.chunkText(text, 1, 0);
    const combined = chunks.map((c) => c.content).join(' ');
    for (const line of hindiLines) {
      expect(combined).toContain(line);
    }
  });

  it('does not treat a date or reference number line as a heading', () => {
    expect(internals.isHeading('12-08-2026')).toBe(false);
    expect(internals.isHeading('1234567890')).toBe(false);
  });

  it('still recognises genuine all-caps and colon headings', () => {
    expect(internals.isHeading('GOVERNMENT OF INDIA')).toBe(true);
    expect(internals.isHeading('Subject:')).toBe(true);
    expect(internals.isHeading('this is ordinary body text')).toBe(false);
  });

  // A heading used only as a section title never reaches the embeddings or the
  // full-text index, yet it is often the most searchable line on the page.
  it('keeps heading text inside the chunk body', () => {
    const text = `GOVERNMENT NOTICE\n\n${words(60)}`;
    const chunks = internals.chunkText(text, 1, 0);

    const combined = chunks.map((c) => c.content).join(' ');
    expect(combined).toContain('GOVERNMENT NOTICE');
    expect(chunks.some((c) => c.sectionTitle === 'GOVERNMENT NOTICE')).toBe(true);
  });

  it('reports charCount and tokenCount consistent with the content', () => {
    const chunks = internals.chunkText(`${words(200)}\n\n${words(200)}`, 1, 0);

    for (const chunk of chunks) {
      expect(chunk.charCount).toBe(chunk.content.length);
      expect(chunk.tokenCount).toBe(internals.estimateTokens(chunk.content));
    }
  });

  it('returns no chunks for empty or trivially short text', () => {
    expect(internals.chunkText('', 1, 0)).toEqual([]);
    expect(internals.chunkText('   \n\n  ', 1, 0)).toEqual([]);
    expect(internals.chunkText('hi', 1, 0)).toEqual([]);
  });
});
