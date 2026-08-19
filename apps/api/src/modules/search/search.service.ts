import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { DatabaseService, Prisma } from '@docsaarthi/database';
import { SearchQueryDto } from './dto/search.dto';

export interface SearchResultItem {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentCategory: string | null;
  pageNumber: number;
  sectionTitle: string | null;
  snippet: string;
  semanticScore: number;
  keywordScore: number;
  finalScore: number;
}

export interface SearchResponse {
  query: string;
  mode: 'hybrid' | 'semantic' | 'keyword';
  results: SearchResultItem[];
  totalResults: number;
  searchDurationMs: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly openai: OpenAI;
  private readonly embeddingModel: string;

  constructor(private readonly db: DatabaseService) {
    this.openai = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'] ?? '',
      baseURL: process.env['OPENAI_BASE_URL'] || undefined,
    });
    this.embeddingModel = process.env['DEFAULT_EMBEDDING_MODEL'] ?? 'text-embedding-3-small';
  }

  // ── Unified Search Entry Point ────────────────────────────────────

  async search(userId: string, dto: SearchQueryDto): Promise<SearchResponse> {
    const startTime = Date.now();
    const mode = dto.mode ?? 'hybrid';
    const limit = dto.limit ?? 10;

    let results: SearchResultItem[] = [];

    if (mode === 'semantic') {
      results = await this.executeSemanticSearch(userId, dto.q, dto, limit);
    } else if (mode === 'keyword') {
      results = await this.executeKeywordSearch(userId, dto.q, dto, limit);
    } else {
      results = await this.executeHybridSearch(userId, dto.q, dto, limit);
    }

    const durationMs = Date.now() - startTime;
    return {
      query: dto.q,
      mode,
      results,
      totalResults: results.length,
      searchDurationMs: durationMs,
    };
  }

  // ── Semantic Search (Vector) ──────────────────────────────────────

  async executeSemanticSearch(
    userId: string,
    query: string,
    filters: Partial<SearchQueryDto>,
    limit = 10,
  ): Promise<SearchResultItem[]> {
    const embedding = await this.generateQueryEmbedding(query);
    if (!embedding) return [];

    const vectorString = `[${Array.from(embedding).join(',')}]`;

    // Dynamic filter clauses
    let docFilter = Prisma.sql`AND d.user_id = ${userId} AND d.is_deleted = false`;
    if (filters.documentId) {
      docFilter = Prisma.sql`${docFilter} AND d.id = ${filters.documentId}`;
    }
    if (filters.category) {
      docFilter = Prisma.sql`${docFilter} AND d.category = ${filters.category}::"DocumentCategory"`;
    }
    if (filters.lang) {
      docFilter = Prisma.sql`${docFilter} AND d.primary_language = ${filters.lang}`;
    }
    if (filters.uploadedAfter) {
      docFilter = Prisma.sql`${docFilter} AND d.created_at >= ${new Date(filters.uploadedAfter)}`;
    }
    if (filters.uploadedBefore) {
      docFilter = Prisma.sql`${docFilter} AND d.created_at <= ${new Date(filters.uploadedBefore)}`;
    }

    try {
      const rows = await this.db.$queryRaw<
        Array<{
          chunk_id: string;
          document_id: string;
          document_title: string;
          document_category: string | null;
          page_number: number;
          section_title: string | null;
          content: string;
          semantic_score: number;
        }>
      >`
        SELECT
          dc.id AS chunk_id,
          d.id AS document_id,
          d.title AS document_title,
          d.category::text AS document_category,
          dc.page_number,
          dc.section_title,
          dc.content,
          GREATEST(0, (1 - (de.embedding <=> ${vectorString}::vector))) AS semantic_score
        FROM document_embeddings de
        JOIN document_chunks dc ON de.chunk_id = dc.id
        JOIN documents d ON dc.document_id = d.id
        WHERE 1=1 ${docFilter}
        ORDER BY de.embedding <=> ${vectorString}::vector ASC
        LIMIT ${limit};
      `;

      return rows.map((r) => ({
        chunkId: r.chunk_id,
        documentId: r.document_id,
        documentTitle: r.document_title,
        documentCategory: r.document_category,
        pageNumber: r.page_number,
        sectionTitle: r.section_title,
        snippet: this.extractSnippet(r.content, query),
        semanticScore: Number(Number(r.semantic_score).toFixed(4)),
        keywordScore: 0,
        finalScore: Number(Number(r.semantic_score).toFixed(4)),
      }));
    } catch (err) {
      this.logger.error(`Semantic search query failed: ${String(err)}`);
      return [];
    }
  }

  // ── Keyword Search (FTS + Trigram) ────────────────────────────────

  async executeKeywordSearch(
    userId: string,
    query: string,
    filters: Partial<SearchQueryDto>,
    limit = 10,
  ): Promise<SearchResultItem[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    let docFilter = Prisma.sql`AND d.user_id = ${userId} AND d.is_deleted = false`;
    if (filters.documentId) {
      docFilter = Prisma.sql`${docFilter} AND d.id = ${filters.documentId}`;
    }
    if (filters.category) {
      docFilter = Prisma.sql`${docFilter} AND d.category = ${filters.category}::"DocumentCategory"`;
    }
    if (filters.lang) {
      docFilter = Prisma.sql`${docFilter} AND d.primary_language = ${filters.lang}`;
    }
    if (filters.uploadedAfter) {
      docFilter = Prisma.sql`${docFilter} AND d.created_at >= ${new Date(filters.uploadedAfter)}`;
    }
    if (filters.uploadedBefore) {
      docFilter = Prisma.sql`${docFilter} AND d.created_at <= ${new Date(filters.uploadedBefore)}`;
    }

    try {
      const rows = await this.db.$queryRaw<
        Array<{
          chunk_id: string;
          document_id: string;
          document_title: string;
          document_category: string | null;
          page_number: number;
          section_title: string | null;
          content: string;
          keyword_score: number;
        }>
      >`
        SELECT
          dc.id AS chunk_id,
          d.id AS document_id,
          d.title AS document_title,
          d.category::text AS document_category,
          dc.page_number,
          dc.section_title,
          dc.content,
          GREATEST(
            ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', ${cleanQuery})),
            CASE WHEN dc.content ILIKE ${'%' + cleanQuery + '%'} THEN 0.75 ELSE 0 END
          ) AS keyword_score
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE (
          to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${cleanQuery})
          OR dc.content ILIKE ${'%' + cleanQuery + '%'}
        )
        ${docFilter}
        ORDER BY keyword_score DESC
        LIMIT ${limit};
      `;

      return rows.map((r) => ({
        chunkId: r.chunk_id,
        documentId: r.document_id,
        documentTitle: r.document_title,
        documentCategory: r.document_category,
        pageNumber: r.page_number,
        sectionTitle: r.section_title,
        snippet: this.extractSnippet(r.content, cleanQuery),
        semanticScore: 0,
        keywordScore: Number(Number(r.keyword_score).toFixed(4)),
        finalScore: Number(Number(r.keyword_score).toFixed(4)),
      }));
    } catch (err) {
      this.logger.error(`Keyword search query failed: ${String(err)}`);
      return [];
    }
  }

  // ── Hybrid Search (Semantic 60% + Keyword 40%) ─────────────────────

  async executeHybridSearch(
    userId: string,
    query: string,
    filters: Partial<SearchQueryDto>,
    limit = 10,
  ): Promise<SearchResultItem[]> {
    const [semanticResults, keywordResults] = await Promise.all([
      this.executeSemanticSearch(userId, query, filters, limit * 2),
      this.executeKeywordSearch(userId, query, filters, limit * 2),
    ]);

    const combinedMap = new Map<string, SearchResultItem>();

    // Normalize semantic scores to [0, 1]
    const maxSemantic = Math.max(...semanticResults.map((r) => r.semanticScore), 0.001);
    for (const item of semanticResults) {
      const normSemantic = item.semanticScore / maxSemantic;
      combinedMap.set(item.chunkId, {
        ...item,
        semanticScore: Number(normSemantic.toFixed(4)),
        keywordScore: 0,
        finalScore: Number((normSemantic * 0.6).toFixed(4)),
      });
    }

    // Normalize keyword scores and blend
    const maxKeyword = Math.max(...keywordResults.map((r) => r.keywordScore), 0.001);
    for (const item of keywordResults) {
      const normKeyword = item.keywordScore / maxKeyword;
      const existing = combinedMap.get(item.chunkId);

      if (existing) {
        existing.keywordScore = Number(normKeyword.toFixed(4));
        existing.finalScore = Number((existing.semanticScore * 0.6 + normKeyword * 0.4).toFixed(4));
      } else {
        combinedMap.set(item.chunkId, {
          ...item,
          semanticScore: 0,
          keywordScore: Number(normKeyword.toFixed(4)),
          finalScore: Number((normKeyword * 0.4).toFixed(4)),
        });
      }
    }

    // Sort by finalScore descending and take limit
    return Array.from(combinedMap.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);
  }

  // ── Helper: Query Embedding ───────────────────────────────────────

  async generateQueryEmbedding(query: string): Promise<Float32Array | null> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: query,
        encoding_format: 'float',
      });
      const embedding = response.data[0]?.embedding;
      return embedding ? new Float32Array(embedding) : null;
    } catch (err) {
      this.logger.warn(
        `Remote query embedding unavailable (${String(err)}). Using deterministic 1536-dim semantic feature vector fallback.`,
      );
      return this.generateFallbackEmbedding(query);
    }
  }

  private generateFallbackEmbedding(text: string, dim = 1536): Float32Array {
    const vec = new Float32Array(dim);
    const clean = text.toLowerCase().trim();
    for (let i = 0; i < clean.length; i++) {
      const code = clean.charCodeAt(i);
      const idx = (code * 31 + i) % dim;
      vec[idx] += 1.0;
      if (i + 2 < clean.length) {
        const trigram = clean.slice(i, i + 3);
        let hash = 0;
        for (let j = 0; j < trigram.length; j++) {
          hash = (hash << 5) - hash + trigram.charCodeAt(j);
          hash |= 0;
        }
        const triIdx = Math.abs(hash) % dim;
        vec[triIdx] += 2.0;
      }
    }
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) vec[i] /= norm;
    return vec;
  }

  // ── Helper: Highlight Snippet ─────────────────────────────────────

  private extractSnippet(content: string, query: string): string {
    if (!content) return '';
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (terms.length === 0) {
      return cleanContent.slice(0, 200) + (cleanContent.length > 200 ? '...' : '');
    }

    // Find first matching term
    let matchIdx = -1;
    for (const term of terms) {
      const idx = cleanContent.toLowerCase().indexOf(term);
      if (idx !== -1) {
        matchIdx = idx;
        break;
      }
    }

    if (matchIdx === -1) {
      return cleanContent.slice(0, 200) + (cleanContent.length > 200 ? '...' : '');
    }

    const windowStart = Math.max(0, matchIdx - 70);
    const windowEnd = Math.min(cleanContent.length, matchIdx + 130);
    let snippet = cleanContent.slice(windowStart, windowEnd);

    if (windowStart > 0) snippet = '...' + snippet;
    if (windowEnd < cleanContent.length) snippet = snippet + '...';

    // Highlight query terms with bold **term**
    for (const term of terms) {
      const regex = new RegExp(`(${term})`, 'gi');
      snippet = snippet.replace(regex, '**$1**');
    }

    return snippet;
  }
}
