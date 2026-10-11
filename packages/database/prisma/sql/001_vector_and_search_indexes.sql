-- ============================================================
-- DocSaarthi — pgvector column + search indexes
--
-- Prisma cannot express the pgvector `vector` type, so the
-- `document_embeddings.embedding` column (which the embedding
-- stage writes to via raw SQL) must be created here.
--
-- Fully idempotent: safe to run on every deploy.
-- Run with:  npm run db:setup-search  (from the repo root)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Vector column ───────────────────────────────────────────
-- 1536 dimensions = Cohere embed-v4.0 / OpenAI text-embedding-3-small.
-- If you change EMBEDDING_DIMENSION you must change it here too.
ALTER TABLE document_embeddings
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- One embedding row per chunk — makes the stage's
-- INSERT ... ON CONFLICT ("chunkId") DO UPDATE actually idempotent.
-- The name matches Prisma's convention for @@unique([chunkId]) so that
-- `prisma migrate diff` reports no drift.
-- Quoted: an unquoted identifier folds to lowercase, which would not match
-- the mixed-case name Prisma expects.
ALTER INDEX IF EXISTS document_embeddings_chunk_id_key
  RENAME TO "document_embeddings_chunkId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "document_embeddings_chunkId_key"
  ON document_embeddings ("chunkId");

-- ── ANN index for semantic search ───────────────────────────
-- Cosine distance (<=>), matching SearchService's operator.
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_hnsw_idx
  ON document_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- ── Full-text + trigram indexes for keyword search ──────────
-- Without these, SearchService.executeKeywordSearch recomputes
-- to_tsvector() for every chunk row on every query.
CREATE INDEX IF NOT EXISTS document_chunks_content_fts_idx
  ON document_chunks
  USING gin (to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS document_chunks_content_trgm_idx
  ON document_chunks
  USING gin (content gin_trgm_ops);

-- ── Citations must survive re-chunking ─────────────────────
-- ChunkingStage deletes and rebuilds a version's chunks on every run. With a
-- required FK and no cascade, that hit `citations_chunkId_fkey` and no
-- document that had ever been cited in a chat could be reprocessed or retried.
-- Everything the UI renders is denormalised onto the citation row, so the
-- chunk link is cleared rather than blocking the delete.
ALTER TABLE citations ALTER COLUMN "chunkId" DROP NOT NULL;
ALTER TABLE citations DROP CONSTRAINT IF EXISTS "citations_chunkId_fkey";
ALTER TABLE citations ADD CONSTRAINT "citations_chunkId_fkey"
  FOREIGN KEY ("chunkId") REFERENCES document_chunks(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DocumentCategory values added after the first deploy ────
-- The classifier prompt and LlmService's extraction schemas offer these six;
-- a database created before they were added to schema.prisma would reject
-- them and fail the whole pipeline for such a document. `prisma db push`
-- adds them for new databases — these statements bring existing ones up to
-- date without a destructive reset.
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'RESUME';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'PASSPORT';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'UTILITY_BILL';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'PROPERTY_DOCUMENT';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'TRANSPORT_DOCUMENT';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'FINANCIAL_REPORT';
