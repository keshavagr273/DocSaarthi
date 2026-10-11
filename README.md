<p align="center">
  <img src="docs/assets/logo.png" alt="DocSaarthi Logo" width="130" style="border-radius: 28px; box-shadow: 0 16px 36px rgba(0,0,0,0.5);" />
  <h1 align="center">DocSaarthi (दस्तावेज़ सारथी)</h1>
  <p align="center">
    <strong>AI-Powered Multilingual Document Intelligence Platform</strong><br/>
    <em>Full OCR, Semantic Hybrid Search, RAG Chatbot, Auto-Classification, and Schema Extraction for Hindi & English Documents.</em>
  </p>
  <p align="center">
    <a href="#-quick-start"><img src="https://img.shields.io/badge/Docker-one--command-2496ED?logo=docker&logoColor=white" alt="Docker"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e.svg" alt="MIT License"></a>
    <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/OCR-PaddleOCR_v4-009688" alt="PaddleOCR">
    <img src="https://img.shields.io/badge/Vector_DB-pgvector-336791?logo=postgresql&logoColor=white" alt="pgvector">
    <img src="https://img.shields.io/badge/LLM-Groq_%2B_OpenAI-F97316" alt="Groq + OpenAI">
    <img src="https://img.shields.io/badge/Framework-Next.js_15_%2B_NestJS-000000?logo=next.js&logoColor=white" alt="Next.js + NestJS">
    <img src="https://img.shields.io/badge/Languages-Hindi_%2B_English-EAB308" alt="Hindi + English">
    <img src="https://img.shields.io/badge/Privacy-Enterprise_Ready-10B981" alt="Privacy First">
  </p>
  <p align="center">
    <a href="#-what-is-docsaarthi">About</a> · 
    <a href="#-features">Features</a> · 
    <a href="#-architecture">Architecture</a> · 
    <a href="#-pipeline-workflow">Pipeline</a> · 
    <a href="#-quick-start">Quick Start</a> · 
    <a href="#-configuration-reference">Configuration</a> · 
    <a href="#-api-documentation">API Docs</a>
  </p>
</p>

---

## What is DocSaarthi?

**DocSaarthi (दस्तावेज़ सारथी)** is an enterprise-grade, end-to-end AI document intelligence platform specifically engineered to process, understand, and extract structured data from **multilingual Indian documents** (Hindi, Devanagari, English, and mixed Hinglish).

Indian documents — such as government gazettes, revenue records (खतौनी / जमाबंदी), court orders, utility bills, invoices, and certificates — frequently suffer from degraded scan quality, stamps, official seals, and complex bilingual text layouts. Standard document tools fail to parse or understand them accurately.

DocSaarthi solves this with a modern, microservices-driven pipeline:

- **Bilingual OCR Engine** — High-precision extraction combining PaddleOCR v4 (Devanagari + Latin) with Vision LLM fallback for low-confidence areas.
- **Conversational RAG in Hindi & English** — Ask questions about your documents in natural Hindi ("इस नोटिस में आवेदन की अंतिम तिथि क्या है?") or English, with exact page-level source citations.
- **Hybrid Semantic Search** — Combines dense vector embeddings (`pgvector`) with sparse lexical matching (`pg_trgm`) to find documents by meaning and exact serial numbers.
- **10 Indian Document Schemas** — Auto-classifies and extracts structured key-value pairs (names, dates, amounts, reference IDs, deadlines) across 10 specialized categories.
- **Human-in-the-Loop Review** — Interactive split-screen review studio with color-coded confidence indicators (Green/Yellow/Red) and field-level override workflows.
- **Semantic Version Diffing** — Track revisions between document amendments with AI-generated delta summaries.

---

## The Problem

Traditional document management systems and global cloud OCR services are not optimized for Indian document nuances:

| What you want to do | Traditional Tools / Cloud OCR | With DocSaarthi (दस्तावेज़ सारथी) |
|---|---|---|
| **Process Hindi & Devanagari documents** | Low accuracy, broken matras, hallucinates characters | **PaddleOCR v4 + Vision Fallback** specifically tuned for Devanagari & Latin |
| **Search mixed Hindi/English paperwork** | Keyword-only search fails across script translations | **Hybrid RAG & Vector Search** understands queries in both Hindi and English |
| **Extract structured data from Government Notices** | Manual typing or brittle regex templates | **LLM-Powered Extraction** mapped to 10 Indian domain schemas |
| **Ask questions about your documents** | Requires manual reading of 50+ page PDFs | **Conversational Assistant** answers in Hindi/English with page citations |
| **Verify ambiguous or noisy scans** | Blindly accepts incorrect OCR or rejects document | **Split-Screen Studio** with confidence scoring & 1-click human verification |
| **Track amendments & version changes** | Diff only shows raw text differences | **Semantic Version Diff** summarizes actual policy and financial changes |
| **Data privacy & deployment flexibility** | Cloud vendor lock-in with expensive per-page billing | **Self-hosted / Hybrid** with Docker, MinIO, Redis, and Supabase / Postgres |

---

## Features

### 1. Multilingual OCR Pipeline (PaddleOCR + Vision LLM)
- Dual-engine OCR architecture using **PaddleOCR v4** as the primary high-speed engine for Devanagari and Latin scripts.
- Integrated **Vision LLM fallback**: when average OCR confidence drops below 70%, high-resolution page crops are automatically routed to vision models for error correction.
- Multi-page PDF splitting and parallel page rendering using `pdf2image` and `PyMuPDF`.

### 2. Hybrid Semantic & Lexical Search
- **Dense Vector Search**: Powered by `pgvector` (HNSW indexing with cosine similarity) for conceptual and cross-lingual meaning.
- **Sparse Lexical Search**: Powered by PostgreSQL `pg_trgm` fuzzy matching to ensure exact matching of reference numbers, tracking IDs, and names.
- **Cross-Lingual Retrieval**: Search in English ("property tax notice") and instantly retrieve Hindi documents ("गृहकर भुगतान सूचना").

### 3. Automatic Classification & Schema Extraction
Every ingested document is classified into one of 10 specialized Indian schemas:
- 🏛️ **Government Notices & Gazettes** (निविदा / अधिसूचना / शासनादेश)
- 🌾 **Land & Revenue Records** (खतौनी / जमाबंदी / खसरा)
- ⚖️ **Legal & Court Orders** (न्यायालय आदेश / याचिका)
- 🧾 **Invoices & Bills** (जीएसटी बिल / बिजली बिल / पानी बिल)
- 📜 **Identity & Certificates** (प्रमाण पत्र / शपथ पत्र)
- 🏢 **Corporate & Employment Records**
- 🏥 **Medical & Insurance Records**
- 🎓 **Educational & Academic Records**
- 🏦 **Banking & Financial Statements**
- 📁 **General & Miscellaneous Documents**

### 4. Interactive Split-Screen Human Review Studio
- **Dual-Pane UI**: Synchronized high-resolution PDF preview alongside extracted key-value fields.
- **Confidence Scoring**: Each field is scored from 0.0 to 1.0 with color tags:
  - 🟢 **High Confidence (≥ 85%)**: Auto-approved.
  - 🟡 **Medium Confidence (70% - 84%)**: Highlighted for quick verification.
  - 🔴 **Low Confidence (< 70%)**: Flagged for human review.
- **Field-Level Audit Trail**: Saves user edits, timestamps, reviewer IDs, and original raw values.

### 5. Conversational Document Assistant (RAG Chat)
- Streaming **Server-Sent Events (SSE)** chat powered by Groq / OpenAI.
- Grounded prompts guarantee zero hallucination — responses cite exact page references `[Source Page N]`.
- Native language toggle: Ask in English, receive answers in pure Hindi or English.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DocSaarthi Web (Next.js 15)                        │
│   Dashboard · Document Studio · Hybrid Search · RAG Chat · Settings & Audit │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / SSE / REST
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                           DocSaarthi API (NestJS)                           │
│  Auth (Argon2id + JWT) · Document Controller · Search Engine · Rate Limiter  │
└──────────────┬───────────────────────┬───────────────────────┬──────────────┘
               │                       │                       │
       BullMQ  │            PostgreSQL │ + pgvector            │ S3 API
┌──────────────▼─────────────┐ ┌───────▼────────────────┐ ┌────▼──────────────┐
│  Ingestion Pipeline        │ │   Supabase / Postgres  │ │  MinIO / S3 / R2  │
│  (14 stages, in the API    │ │   - Documents & Chunks │ │   - Original PDFs │
│   process via BullMQ)      │ │   - Extracted Fields   │ │   - Rendered PNGs │
│  - File Validator          │ │   - Vector Embeddings  │ │   - Thumbnails    │
│  - PaddleOCR / Vision OCR  │ │   - Audit Trail Logs   │ └───────────────────┘
│  - Groq LLM + Cohere Embed │ │                        │
│  - pgvector Ingestor       │ └────────────────────────┘
└────────────────────────────┘
```

---

## Pipeline Workflow

```
┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐
│  Upload  │    │  Validate   │    │  PaddleOCR   │    │  Classify   │    │   Extract   │
│   PDF /  ├───►│  & Render   ├───►│  Hindi + Eng ├───►│  10 Indian  ├───►│  Structured │
│   Image  │    │   Pages     │    │  Sidecar     │    │  Categories │    │   Fields    │
└──────────┘    └─────────────┘    └──────────────┘    └─────────────┘    └──────┬──────┘
                                                                                 │
┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐           │
│ Search & │    │  pgvector   │    │ Text Chunking│    │  Confidence │           │
│ RAG Chat │◄───┤  Embeddings │◄───┤  & Semantic  │◄───┤  Scoring &  │◄──────────┘
│ Ready    │    │  Stored     │    │  Vectors     │    │  Validation │
└──────────┘    └─────────────┘    └──────────────┘    └─────────────┘
```

The pipeline is **14 discrete stages** run in order by a single BullMQ consumer
inside the API process (`apps/api/src/modules/processor`):

| # | Stage | What it does |
|---|---|---|
| 1 | `FILE_VALIDATION` | Confirms the object exists, checks PDF magic bytes, counts pages |
| 2 | `FILE_STORAGE` | Renders a WebP thumbnail |
| 3 | `PDF_RENDERING` | Rasterises every page to PNG at 2x and creates `document_pages` |
| 4 | `IMAGE_PREPROCESSING` | Auto-orient, gamma, contrast stretch, unsharp mask |
| 5 | `OCR` | PDF text layer → Vision LLM → PaddleOCR → Tesseract, first hit wins |
| 6 | `LANGUAGE_DETECTION` | Devanagari vs Latin ratio per page, aggregated |
| 7 | `DOCUMENT_CLASSIFICATION` | One of 21 categories (respects a manual override) |
| 8 | `TEXT_NORMALIZATION` | NFC, zero-width strip, whitespace and line-ending cleanup |
| 9 | `STRUCTURED_EXTRACTION` | Category-specific field schema (keeps verified fields) |
| 10 | `CONFIDENCE_SCORING` | `0.7 × LLM + 0.3 × best matching OCR block` |
| 11 | `VALIDATION` | Date/currency/GSTIN parsing, invoice math, chronology checks |
| 12 | `CHUNKING` | 300–600 token target, hard-capped at 1000 |
| 13 | `EMBEDDING` | Batched, Redis-cached, written to pgvector |
| 14 | `INDEXING` | Verifies embeddings exist and the FTS query runs |

Each stage records a marker in `document_versions.stageHistory`. On a retry the
pipeline **skips** stages already marked `COMPLETED` and each skipped stage
restores its own output from the database, so a resume cannot silently run a
later stage against an empty context.

---

## Operations

### Reprocessing existing documents

After fixing a configuration or pipeline bug, re-run the pipeline over documents
that are already uploaded. The API must be running — this only enqueues jobs.

```bash
# See what would be reprocessed and why — always start here
npm run reprocess -- --dry-run

# Repair everything that looks wrong (no fields, UNKNOWN category,
# embeddings from a previous model, no chunks, stuck mid-pipeline)
npm run reprocess -- --needs-repair --yes

# Or target precisely
npm run reprocess -- --stale-embeddings --yes
npm run reprocess -- --id <documentId> --yes

# Give documents whose original file is gone from storage a terminal FAILED
# state, instead of leaving them QUEUED forever with no explanation
npm run reprocess -- --needs-repair --fail-unusable --yes
```

The script checks that each source file still exists in object storage before
enqueuing, and reports the ones that do not rather than queuing jobs that are
certain to fail. Human-verified fields are preserved (the pipeline keeps rows
with `isVerified`/`isRejected` set).

Selectors: `--all`, `--needs-repair` (default), `--no-fields`, `--bad-category`,
`--stale-embeddings`, `--no-chunks`, `--stuck`, `--id <documentId>`.

### Re-embedding after an embedding-model change

Semantic search only compares vectors from the **same** model, so switching
`EMBEDDING_PROVIDER` / `DEFAULT_EMBEDDING_MODEL` silently drops every older
document out of semantic results. Re-embedding the chunk text already in the
database is far cheaper than a full reprocess, and works even for documents
whose original file is no longer in storage:

```bash
npm run reembed -- --dry-run
npm run reembed -- --yes
```

```sql
-- Should return exactly one row once everything is consistent
SELECT model, dimension, COUNT(*) FROM document_embeddings GROUP BY 1, 2;
```

### Never share a Redis prefix between environments

`REDIS_PREFIX` namespaces the BullMQ queue. Two environments pointing at the
same Redis with the same prefix **share one work queue**, so whichever process
grabs a job first processes it — a developer's laptop will pick up a production
upload, download that document from production object storage and write results
back to the production database.

Give every environment its own prefix (`docsaarthi:dev:`, `docsaarthi:prod:`)
or its own Redis instance. To check what a running service is actually using:

```bash
curl -s "$API_URL/api/health" | jq '.data.info.queues'
```

Identical `completed`/`failed` counts across two environments means they are
sharing a queue.

### Health and queue state

```bash
curl -s http://localhost:3001/api/health | jq
```

Reports database, storage, chat-model and queue state. The LLM check makes a
real one-token call rather than just confirming a key is present, so a retired
or misspelled `DEFAULT_LLM_MODEL` shows as `degraded` with the provider's error
instead of a misleading `ok`:

```json
"llmProvider": {
  "status": "down",
  "model": "llama-3.1-8b-instant",
  "error": "404 The model `llama-3.1-8b-instant` does not exist..."
}
```

The same check runs at startup and logs a loud `CHAT MODEL UNAVAILABLE` error.
This matters because classification and extraction degrade silently: with an
unreachable model every document used to finish as `COMPLETED` with category
`UNKNOWN` and zero fields. They now fail the job instead, so BullMQ retries a
transient outage and a genuine misconfiguration surfaces as a failed document
with `LLM_UNAVAILABLE` rather than a quietly empty one.

A document that is stuck shows as `PROCESSING` with no terminal state;
`npm run reprocess -- --stuck --yes` requeues those.

### Diagnosing a document that produced nothing

```sql
-- Which OCR engine actually read each page?
SELECT "pageNumber", "ocrProvider", "fallbackProvider", "pageConfidence",
       length("rawText") AS chars
FROM ocr_results WHERE "versionId" = '<versionId>' ORDER BY "pageNumber";

-- Where did the pipeline get to?
SELECT jsonb_pretty("stageHistory"::jsonb) FROM document_versions WHERE id = '<versionId>';
```

---

## Feature Comparison

| Feature | DocSaarthi | Tesseract | AWS Textract | Google Doc AI | Paperless-ngx |
|---|:---:|:---:|:---:|:---:|:---:|
| **Hindi / Devanagari OCR** | ✅ **High (PaddleOCR v4)** | ⚠️ Basic | ⚠️ Limited | ✅ Good | ⚠️ Basic |
| **Bilingual Hybrid Search** | ✅ **pgvector + pg_trgm** | ❌ | ❌ | ❌ | ⚠️ Keywords only |
| **Indian Document Schemas** | ✅ **10 Built-in** | ❌ | ❌ | ❌ | ❌ |
| **Conversational RAG Chat** | ✅ **Hindi + English** | ❌ | ❌ | ❌ | ❌ |
| **Split-Screen Review Studio** | ✅ **Built-in** | ❌ | ⚠️ Cloud UI | ⚠️ Cloud UI | ⚠️ Basic |
| **Self-Hosted / Cloud Ready** | ✅ **100% Docker** | ✅ | ❌ SaaS | ❌ SaaS | ✅ |
| **Free LLM Tier (Groq)** | ✅ **Supported** | ❌ | ❌ | ❌ | ❌ |
| **Semantic Version Diffing** | ✅ **Built-in** | ❌ | ❌ | ❌ | ❌ |

---

## Quick Start

### Prerequisites
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** installed and running
- **[Node.js 20+](https://nodejs.org/)** & `npm`
- **Git**

---

### Step 1: Clone and Configure

```bash
git clone https://github.com/keshavagr273/DocSaarthi.git
cd DocSaarthi
cp .env.example .env
```

Edit `.env` with your API keys and configuration:

```env
# Database (Supabase or Local Postgres)
DATABASE_URL="postgresql://postgres:password@localhost:5432/docsaarthi"

# LLM Provider (Groq Free Tier or OpenAI)
OPENAI_API_KEY="gsk_your_groq_api_key_here"
OPENAI_BASE_URL="https://api.groq.com/openai/v1"
DEFAULT_LLM_MODEL="openai/gpt-oss-20b"
```

---

### Step 2: Start Infrastructure Containers

```bash
npm run docker:up
```

This starts:
- ⚡ **Redis 7** on port `6379` (Caching & BullMQ ingestion queues)
- 🗄️ **MinIO S3** on port `9000` (API) & `9001` (Console)
- 🔍 **PaddleOCR Microservice** on port `8081` (Devanagari/Latin OCR)

---

### Step 3: Run Migrations & Start Development Servers

```bash
# 1. Generate the Prisma client
npm run db:generate

# 2. Create the tables
npm run db:migrate:deploy          # or: npm run db:push

# 3. Create the pgvector column and the search indexes.
#    Prisma cannot express the `vector` type, so the embedding column and the
#    HNSW / full-text / trigram indexes live in raw SQL. The document pipeline
#    writes to that column, so this step is REQUIRED, not optional.
#    It is idempotent — safe to re-run on every deploy.
npm run db:setup-search

# 4. Start all applications (API + Web) in parallel.
#    The document pipeline runs inside the API process — there is no
#    separate worker service to start.
npm run dev
```

### Access Your Applications:
- 🌐 **Frontend Web App**: [http://localhost:3000](http://localhost:3000)
- ⚙️ **Backend REST API**: [http://localhost:3001](http://localhost:3001)
- 📖 **Swagger Interactive API Docs**: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- 🗄️ **MinIO S3 Storage Console**: [http://localhost:9001](http://localhost:9001)

---

## Configuration Reference

All application parameters are environment-driven and validated via Zod:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend API port |
| `DATABASE_URL` | *(required)* | PostgreSQL connection string with `pgvector` |
| `DIRECT_URL` | *(optional)* | Direct PostgreSQL session URL for Supabase migrations |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `MINIO_ENDPOINT` | `localhost` | S3 / MinIO server endpoint |
| `MINIO_PORT` | `9000` | S3 / MinIO port |
| `MINIO_ACCESS_KEY` | `docsaarthi_minio` | MinIO access key |
| `MINIO_SECRET_KEY` | `docsaarthi_minio_secret`| MinIO secret key |
| `MINIO_BUCKET` | `docsaarthi` | S3 bucket name |
| `OPENAI_API_KEY` | *(optional)* | Groq or OpenAI API key |
| `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` | Custom LLM base URL (Groq, Ollama, etc.) |
| `DEFAULT_LLM_MODEL` | `openai/gpt-oss-120b` | Chat model for RAG and field extraction |
| `GEMINI_API_KEY` | *(optional)* | Enables Vision OCR for scans, photos and handwriting |
| `DEFAULT_VISION_MODEL` | `gemini-3.5-flash` | Vision model used for image OCR |
| `EMBEDDING_PROVIDER` | `cohere` | `cohere` or `openai` |
| `DEFAULT_EMBEDDING_MODEL` | `embed-v4.0` | Embedding model |
| `EMBEDDING_DIMENSION` | `1536` | Must match the `vector(N)` column width |
| `ALLOW_FALLBACK_EMBEDDINGS` | `true` | See *Embedding fallback* below |
| `EXTRACTION_TEXT_BUDGET_CHARS` | `16000` | OCR text sent to field extraction |
| `EXTRACTION_MAX_RESPONSE_TOKENS` | `4000` | Response budget for field extraction |
| `OCR_PROVIDER` | `paddle` | `paddle`, or `vision` to use the VLM first |
| `OCR_PADDLE_URL` | `http://localhost:8081` | Python PaddleOCR microservice endpoint |
| `OCR_PADDLE_TIMEOUT_MS` | `120000` | Per-page sidecar timeout |
| `OCR_CIRCUIT_OPEN_MS` | `60000` | How long to skip the sidecar after a failure |
| `ACCESS_TOKEN_SECRET` | *(required 32+ chars)* | Secret key for JWT signing |
| `REFRESH_TOKEN_SECRET`| *(required 32+ chars)* | Secret key for refresh token rotation |
| `PRISMA_LOG_QUERIES` | `false` | Echo every SQL query (very noisy) |

### Choosing a chat model

`OPENAI_BASE_URL` points at an OpenAI-**compatible** endpoint, so
`DEFAULT_LLM_MODEL` must be a model id that endpoint serves, written exactly as
that provider writes it. For Groq this is a bare id such as
`openai/gpt-oss-120b`. A `provider/model` prefix of the LiteLLM/OpenRouter kind
(for example `groq/llama3-8b-8192`) returns **404** from Groq, and Groq retires
older models — list what your key can actually reach before setting it:

```bash
curl -s https://api.groq.com/openai/v1/models   -H "Authorization: Bearer $OPENAI_API_KEY" | jq -r '.data[].id'
```

Classification and extraction degrade silently if this is wrong: documents still
finish, but every one of them lands as `UNKNOWN` with zero extracted fields.
Check the startup log line to confirm what is actually loaded:

```
[LlmService] LlmService initialized: chatModel=openai/gpt-oss-120b | visionModel=gemini-3.5-flash | ...
```

### Embedding fallback

If the embedding provider is unreachable, the pipeline can fall back to
deterministic local hash vectors so ingestion keeps moving. These are **not**
semantic: they are comparable only to each other. Such rows are stored under the
model name `local-hash-fallback` so they can be found and re-embedded later:

```sql
SELECT DISTINCT "documentId" FROM document_embeddings WHERE model = 'local-hash-fallback';
```

Semantic search only compares vectors produced by the **same** model, so these
rows simply will not match a real query vector (rather than returning nonsense).
Set `ALLOW_FALLBACK_EMBEDDINGS=false` to fail the stage and let the job retry
instead.

---

## API Documentation

DocSaarthi exposes a full Swagger OpenAPI specification at `http://localhost:3001/api/docs`.

### Key Endpoints:
- `POST /api/v1/auth/register` — Create user account
- `POST /api/v1/auth/login` — Authenticate and receive HttpOnly cookie tokens
- `POST /api/v1/documents/upload` — Upload PDF/image documents for background ingestion
- `GET  /api/v1/documents` — List user documents with filtering and pagination
- `GET  /api/v1/documents/:id` — Retrieve document details, OCR text, and extracted fields
- `GET  /api/v1/search` — Execute hybrid semantic + lexical search
- `POST /api/v1/conversations/:id/messages` — SSE streaming conversational RAG Q&A
- `GET  /api/v1/audit` — Query user action logs and audit trail

---

## Project Structure

```text
DocSaarthi/
├── apps/
│   ├── api/                     # NestJS Backend REST API & Swagger
│   │   ├── src/common/          # Caching, Rate Limiting, API Key Guards
│   │   ├── src/config/          # Zod Environment Validation Schema
│   │   └── src/modules/         # Auth, Documents, Search, Conversations, Audit
│   │   └── src/modules/processor # 14-stage ingestion pipeline (BullMQ consumer)
│   │       ├── stages/          # Validation, OCR, Classification, Chunking, Embedding
│   │       └── services/        # LLM Client, OCR Sidecar Client
│   └── web/                     # Next.js 15 Frontend Application
│       ├── app/(app)/           # Dashboard, Studio, Search, Review, Settings
│       ├── components/          # Glassmorphic UI Components
│       └── lib/                 # Axios Client & TypeScript Interfaces
├── packages/
│   ├── database/                # Prisma ORM Schema, pgvector SQL, DatabaseService
│   └── shared/                  # Shared Queue Names, Constants, and Key Generators
├── infra/
│   ├── docker/                  # Dockerfiles (PaddleOCR Python Service, Multi-stage Apps)
│   ├── docker-compose.yml       # Local Development Infrastructure
│   └── docker-compose.prod.yml  # Production Full-Stack Compose
├── docs/                        # Assets, Logo, and Project Documentation
├── .github/workflows/ci.yml     # Automated Monorepo CI/CD Pipeline
├── .env.example                 # Environment Template
└── README.md                    # Project Documentation
```

---

## Contributing

Contributions are welcome! To contribute:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feat/my-new-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to the branch (`git push origin feat/my-new-feature`)
5. **Open** a Pull Request

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>DocSaarthi (दस्तावेज़ सारथी)</strong><br/>
  <em>Empowering Multilingual Indian Document Intelligence with AI.</em>
</p>
