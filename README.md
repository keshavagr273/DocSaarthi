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
│  Async Ingestion Worker    │ │   Supabase / Postgres  │ │    MinIO / S3     │
│  - File Validator          │ │   - Documents & Chunks │ │   - Original PDFs │
│  - PaddleOCR Python Engine │ │   - Extracted Fields   │ │   - Rendered PNGs │
│  - Groq / OpenAI LLM       │ │   - Vector Embeddings  │ │   - Thumbnails    │
│  - pgvector Ingestor       │ │   - Audit Trail Logs   │ └───────────────────┘
└────────────────────────────┘ └────────────────────────┘
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
# Push database tables and pgvector schema
npm run db:migrate:deploy

# Start all applications (API, Web, Worker) in parallel
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
| `DEFAULT_LLM_MODEL` | `openai/gpt-oss-20b` | Chat model for RAG and field extraction |
| `OCR_PADDLE_URL` | `http://localhost:8081` | Python PaddleOCR microservice endpoint |
| `ACCESS_TOKEN_SECRET` | *(required 32+ chars)* | Secret key for JWT signing |
| `REFRESH_TOKEN_SECRET`| *(required 32+ chars)* | Secret key for refresh token rotation |

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
│   ├── web/                     # Next.js 15 Frontend Application
│   │   ├── app/(app)/           # Dashboard, Studio, Search, Review, Settings
│   │   ├── components/          # Glassmorphic UI Components
│   │   └── lib/                 # Axios Client & TypeScript Interfaces
│   └── worker/                  # BullMQ Async Document Processing Worker
│       ├── src/stages/          # Validation, PaddleOCR, Classification, Embeddings
│       └── src/services/        # LLM Client, Storage Client, OCR Sidecar Client
├── packages/
│   ├── database/                # Prisma ORM Schema, pgvector Migrations, DatabaseService
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
