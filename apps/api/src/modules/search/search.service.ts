import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { DatabaseService, Prisma } from '@docsaarthi/database';
import { SearchQueryDto } from './dto/search.dto';
import { FALLBACK_EMBEDDING_MODEL } from '../processor/services/llm.service';

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
  private readonly cohereApiKey?: string;
  private readonly embeddingProvider: string;
  private readonly embeddingModel: string;
  /**
   * Must match LlmService's dimension — the hash fallback was hard-coded to
   * 1536 here, so a deployment with a different EMBEDDING_DIMENSION produced
   * a query vector of the wrong width and every semantic search failed.
   */
  private readonly embeddingDimension: number;

  constructor(private readonly db: DatabaseService) {
    this.openai = new OpenAI({
      apiKey: process.env['EMBEDDING_API_KEY'] || process.env['OPENAI_API_KEY'] || '',
      baseURL: process.env['EMBEDDING_BASE_URL'] || process.env['OPENAI_BASE_URL'] || undefined,
    });
    this.cohereApiKey =
      process.env['COHERE_API_KEY'] ||
      (process.env['EMBEDDING_PROVIDER'] === 'cohere' ? process.env['EMBEDDING_API_KEY'] : undefined);
    this.embeddingProvider = (
      process.env['EMBEDDING_PROVIDER'] || (this.cohereApiKey ? 'cohere' : 'openai')
    ).toLowerCase();
    this.embeddingModel =
      process.env['DEFAULT_EMBEDDING_MODEL'] ??
      (this.embeddingProvider === 'cohere' ? 'embed-v4.0' : 'text-embedding-3-small');
    this.embeddingDimension = Number(process.env['EMBEDDING_DIMENSION'] ?? 1536);
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
    const queryEmbedding = await this.generateQueryEmbedding(query);
    if (!queryEmbedding) return [];

    const { embedding, model: queryModel } = queryEmbedding;
    const vectorString = `[${Array.from(embedding).join(',')}]`;

    // Dynamic filter clauses
    let docFilter = Prisma.sql`AND d."userId" = ${userId} AND d."isDeleted" = false`;
    if (filters.documentId) {
      docFilter = Prisma.sql`${docFilter} AND d.id = ${filters.documentId}`;
    }
    if (filters.category) {
      docFilter = Prisma.sql`${docFilter} AND d.category = ${filters.category}::"DocumentCategory"`;
    }
    if (filters.lang) {
      docFilter = Prisma.sql`${docFilter} AND d."primaryLanguage" = ${filters.lang}`;
    }
    if (filters.uploadedAfter) {
      docFilter = Prisma.sql`${docFilter} AND d."createdAt" >= ${new Date(filters.uploadedAfter)}`;
    }
    if (filters.uploadedBefore) {
      docFilter = Prisma.sql`${docFilter} AND d."createdAt" <= ${new Date(filters.uploadedBefore)}`;
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
          dc."pageNumber" AS page_number,
          dc."sectionTitle" AS section_title,
          dc.content,
          GREATEST(0, (1 - (de.embedding <=> ${vectorString}::vector))) AS semantic_score
        FROM document_embeddings de
        JOIN document_chunks dc ON de."chunkId" = dc.id
        JOIN documents d ON dc."documentId" = d.id
        WHERE de.model = ${queryModel} ${docFilter}
        ORDER BY de.embedding <=> ${vectorString}::vector ASC
        LIMIT ${limit};
      `;

      if (rows.length === 0) {
        // Distinguish "nothing matched" from "nothing is comparable". Vectors
        // from different models are not comparable at all, so without the
        // model filter above this returned confidently-ranked nonsense.
        await this.warnOnModelMismatch(userId, queryModel);
      }

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

    const words = cleanQuery
      .split(/\s+/)
      .map((w) => w.replace(/['":*&|!()\\]/g, '').trim())
      .filter((w) => w.length >= 2);
    const searchWords = words.length > 0 ? words : [cleanQuery];

    let docFilter = Prisma.sql`AND d."userId" = ${userId} AND d."isDeleted" = false`;
    if (filters.documentId) {
      docFilter = Prisma.sql`${docFilter} AND d.id = ${filters.documentId}`;
    }
    if (filters.category) {
      docFilter = Prisma.sql`${docFilter} AND d.category = ${filters.category}::"DocumentCategory"`;
    }
    if (filters.lang) {
      docFilter = Prisma.sql`${docFilter} AND d."primaryLanguage" = ${filters.lang}`;
    }
    if (filters.uploadedAfter) {
      docFilter = Prisma.sql`${docFilter} AND d."createdAt" >= ${new Date(filters.uploadedAfter)}`;
    }
    if (filters.uploadedBefore) {
      docFilter = Prisma.sql`${docFilter} AND d."createdAt" <= ${new Date(filters.uploadedBefore)}`;
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
          dc."pageNumber" AS page_number,
          dc."sectionTitle" AS section_title,
          dc.content,
          GREATEST(
            CASE WHEN dc.content ILIKE ${'%' + cleanQuery + '%'} THEN 0.95 ELSE 0 END,
            ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', ${cleanQuery})) * 1.5,
            ts_rank(to_tsvector('english', dc.content), websearch_to_tsquery('english', ${cleanQuery})) * 1.2,
            -- Partial-match floor, scaled by how many query words the chunk
            -- actually contains. This was a flat 0.15, so every row that
            -- matched a single word scored identically and the ordering of
            -- partial matches was arbitrary — a chunk containing all but one
            -- term ranked no higher than one containing just one term. Hindi
            -- and other non-English text relies on this path entirely, since
            -- the 'english' text-search config does not stem it.
            (
              SELECT 0.10 + 0.35 * (COUNT(*)::float / GREATEST(array_length(${searchWords}::text[], 1), 1))
              FROM unnest(${searchWords}::text[]) w
              WHERE dc.content ILIKE '%' || w || '%'
            )
          ) AS keyword_score
        FROM document_chunks dc
        JOIN documents d ON dc."documentId" = d.id
        WHERE (
          to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${cleanQuery})
          OR to_tsvector('english', dc.content) @@ websearch_to_tsquery('english', ${cleanQuery})
          OR dc.content ILIKE ${'%' + cleanQuery + '%'}
          OR EXISTS (
            SELECT 1 FROM unnest(${searchWords}::text[]) word
            WHERE length(word) >= 3 AND dc.content ILIKE '%' || word || '%'
          )
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

  /**
   * Embed the query, reporting which model produced the vector.
   *
   * The model matters: executeSemanticSearch filters stored rows to the same
   * model, because vectors from two different models are not comparable and
   * comparing them produces confidently-ranked noise.
   */
  async generateQueryEmbedding(
    query: string,
  ): Promise<{ embedding: Float32Array; model: string } | null> {
    const cleanQuery = query.trim() || ' ';

    // 1. Prefer Cohere if configured
    if (this.embeddingProvider === 'cohere' && this.cohereApiKey) {
      try {
        const response = await fetch('https://api.cohere.com/v2/embed', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.cohereApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.embeddingModel,
            texts: [cleanQuery],
            input_type: 'search_query',
            embedding_types: ['float'],
            truncate: 'END',
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Cohere API error ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as {
          embeddings?: { float?: number[][] };
        };
        const embedding = data.embeddings?.float?.[0];
        return embedding
          ? { embedding: new Float32Array(embedding), model: this.embeddingModel }
          : null;
      } catch (err) {
        this.logger.warn(
          `Cohere query embedding failed (${String(err)}). Using the deterministic hash fallback.`,
        );
        return {
          embedding: this.generateFallbackEmbedding(cleanQuery, this.embeddingDimension),
          model: FALLBACK_EMBEDDING_MODEL,
        };
      }
    }

    // 2. OpenAI embedding fallback
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: cleanQuery,
        encoding_format: 'float',
      });
      const embedding = response.data[0]?.embedding;
      return embedding
        ? { embedding: new Float32Array(embedding), model: this.embeddingModel }
        : null;
    } catch (err) {
      this.logger.warn(
        `Remote query embedding unavailable (${String(err)}). Using the deterministic hash fallback.`,
      );
      return {
        embedding: this.generateFallbackEmbedding(cleanQuery, this.embeddingDimension),
        model: FALLBACK_EMBEDDING_MODEL,
      };
    }
  }

  /**
   * When a semantic search returns nothing, check whether the user has
   * embeddings stored under a different model and say so. Otherwise an
   * embedding-provider change (or an outage that stored hash fallbacks) looks
   * exactly like "this user has no matching documents".
   */
  private async warnOnModelMismatch(userId: string, queryModel: string): Promise<void> {
    try {
      const rows = await this.db.$queryRaw<Array<{ model: string; count: bigint }>>`
        SELECT de.model, COUNT(*) AS count
        FROM document_embeddings de
        JOIN documents d ON de."documentId" = d.id
        WHERE d."userId" = ${userId} AND d."isDeleted" = false
        GROUP BY de.model
      `;

      const otherModels = rows.filter((r) => r.model !== queryModel);
      if (otherModels.length > 0) {
        this.logger.warn(
          `Semantic search found no rows for model "${queryModel}", but this user has ` +
          otherModels.map((r) => `${Number(r.count)} under "${r.model}"`).join(', ') +
          '. Those embeddings must be regenerated with the current provider to be searchable.',
        );
      }
    } catch {
      // Diagnostics only — never fail a search because of this.
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
