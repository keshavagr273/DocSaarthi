# DocSaarthi — Implementation Plan

> **Version:** 1.0.0
> **Date:** August 2026
> **Audience:** Engineering Team
> **Status:** Active

---

## Table of Contents

1. [Overview & Philosophy](#1-overview--philosophy)
2. [Team & Roles](#2-team--roles)
3. [Development Environment Setup](#3-development-environment-setup)
4. [Phase 0: Foundations (Week 1-2)](#4-phase-0-foundations-week-1-2)
5. [Phase 1: Core Backend (Week 3-6)](#5-phase-1-core-backend-week-3-6)
6. [Phase 2: Processing Pipeline (Week 7-10)](#6-phase-2-processing-pipeline-week-7-10)
7. [Phase 3: AI Intelligence (Week 11-14)](#7-phase-3-ai-intelligence-week-11-14)
8. [Phase 4: Frontend (Week 11-16)](#8-phase-4-frontend-week-11-16)
9. [Phase 5: Search & RAG (Week 15-18)](#9-phase-5-search--rag-week-15-18)
10. [Phase 6: Production Hardening (Week 17-20)](#10-phase-6-production-hardening-week-17-20)
11. [Phase 7: Advanced Features (Week 19-24)](#11-phase-7-advanced-features-week-19-24)
12. [Testing Strategy](#12-testing-strategy)
13. [Deployment Strategy](#13-deployment-strategy)
14. [Technical Decisions & Tradeoffs](#14-technical-decisions--tradeoffs)
15. [Definition of Done](#15-definition-of-done)
16. [Task Breakdown (Granular)](#16-task-breakdown-granular)

---

## 1. Overview & Philosophy

### Build Philosophy

**Ship thin verticals, not horizontal layers.**

Do not build the entire database schema, then the entire API, then the entire frontend. Instead, build complete vertical slices that deliver user value end-to-end:

```
Week 1-2:   Infrastructure (everyone needs this to start)
Week 3-4:   Auth + User management (vertical 1)
Week 5-6:   Document upload (vertical 2)
Week 7-10:  Processing pipeline (vertical 3)
Week 11-14: AI layer (vertical 4)
Week 11-16: Frontend (parallel to AI)
Week 15-18: Search + RAG (vertical 5)
Week 17-20: Production hardening
Week 19-24: Advanced features
```

### Key Engineering Principles

1. **TypeScript everywhere** — No untyped code. Strict mode on.
2. **Tests from day one** — Every service gets a unit test. Every API gets an integration test.
3. **Feature flags** — Unfinished features hidden behind flags, never committed as broken code.
4. **Environment parity** — Dev == Staging == Prod as much as possible (Docker Compose).
5. **Observability first** — Logging, tracing, and metrics are not afterthoughts.
6. **Document everything** — README per package, JSDoc for public APIs, OpenAPI for endpoints.

---

## 2. Team & Roles

| Role | Responsibilities | Count |
|---|---|---|
| Tech Lead / Architect | Architecture, cross-cutting concerns, code review, DevOps | 1 |
| Backend Engineer | NestJS API, database, auth, processing pipeline | 1-2 |
| AI/ML Engineer | OCR integration, LLM providers, embedding, RAG, agents | 1 |
| Frontend Engineer | Next.js UI, document viewer, chat interface | 1 |
| DevOps / Infrastructure | Docker, CI/CD, monitoring, deployment | 0.5 (shared) |

*For a solo founder or small team, the roles above collapse into 2-3 people. Phase timelines should be adjusted accordingly.*

---

## 3. Development Environment Setup

### 3.1 Prerequisites

```bash
# Required tools
node >= 20.0.0
npm >= 10.0.0
docker >= 24.0.0
docker compose >= 2.20.0
git >= 2.40.0

# Optional but recommended
python >= 3.10  # For PaddleOCR sidecar development
cuda >= 11.8    # For GPU-accelerated OCR (optional)
```

### 3.2 Monorepo Initialization

```bash
# Create project root
mkdir docsaarthi && cd docsaarthi
git init

# Initialize Turborepo
npx -y create-turbo@latest ./ --skip-install

# Install root dependencies
npm install

# Install Turborepo
npm install -D turbo typescript @types/node

# Create workspace package.json with workspaces
cat > package.json << 'EOF'
{
  "name": "docsaarthi",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "db:migrate": "cd packages/database && npx prisma migrate dev",
    "db:generate": "cd packages/database && npx prisma generate",
    "db:seed": "cd packages/database && npx ts-node prisma/seed.ts",
    "docker:up": "docker compose -f infra/docker-compose.yml up -d",
    "docker:down": "docker compose -f infra/docker-compose.yml down"
  }
}
EOF
```

### 3.3 NestJS API Setup

```bash
# Create NestJS API app
cd apps
npx -y @nestjs/cli new api --package-manager npm --strict --skip-git

# Install NestJS dependencies
cd api
npm install @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/swagger
npm install @nestjs/bull bullmq
npm install passport passport-jwt passport-local passport-google-oauth20
npm install class-validator class-transformer
npm install argon2 jsonwebtoken cookie-parser helmet
npm install @aws-sdk/client-s3 @aws-sdk/s3-presigned-post
npm install openai @anthropic-ai/sdk @google/generative-ai
npm install ioredis @nestjs/cache-manager cache-manager-redis-store
npm install file-type multer sharp pdf2pic
npm install winston nest-winston

npm install -D @types/passport-jwt @types/passport-local @types/multer
npm install -D @types/cookie-parser jest @nestjs/testing supertest
```

### 3.4 Next.js Frontend Setup

```bash
cd apps
npx -y create-next-app@latest web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"

cd web
npm install @tanstack/react-query axios
npm install react-hook-form zod @hookform/resolvers
npm install framer-motion
npm install react-pdf pdfjs-dist
npm install react-dropzone
npm install lucide-react

# shadcn/ui
npx -y shadcn@latest init
npx -y shadcn@latest add button card dialog sheet badge
npx -y shadcn@latest add input label textarea select
npx -y shadcn@latest add toast sonner progress
npx -y shadcn@latest add table tabs scroll-area separator
npx -y shadcn@latest add avatar dropdown-menu
npx -y shadcn@latest add chart
```

### 3.5 Database Package Setup

```bash
cd packages/database
npm init -y
npm install @prisma/client
npm install -D prisma typescript ts-node @types/node

npx prisma init --datasource-provider postgresql
# Then populate schema.prisma with the full schema from architecture.md
```

### 3.6 Docker Infrastructure

```bash
# Spin up all infrastructure services
docker compose -f infra/docker-compose.yml up -d

# Verify services
docker compose ps

# Run initial migrations
npm run db:migrate

# Seed with test data
npm run db:seed

# Verify MinIO setup
open http://localhost:9001  # MinIO console
```

---

## 4. Phase 0: Foundations (Week 1-2)

### Goals
- Monorepo structure complete and working
- All infrastructure services running via Docker Compose
- Shared packages created and published internally
- CI pipeline running
- Database schema migrated

### Week 1 Tasks

#### Task 0.1: Monorepo & Tooling Setup
- [ ] Initialize Turborepo monorepo
- [ ] Configure `turbo.json` with task pipelines
- [ ] Set up root `tsconfig.base.json` with strict mode
- [ ] Configure ESLint + Prettier with shared config
- [ ] Set up `packages/shared` with common types/utils
- [ ] Set up `packages/config` with env validation (Zod)
- [ ] Set up `packages/types` with domain type definitions
- [ ] Create `.env.example` with all variables documented

#### Task 0.2: Infrastructure (Docker Compose)
- [ ] PostgreSQL 16 with pgvector extension init script
- [ ] Redis 7 with persistence config
- [ ] MinIO with bucket initialization script
- [ ] PaddleOCR sidecar Dockerfile (Python + PaddleOCR + FastAPI)
- [ ] nginx reverse proxy config (local dev)
- [ ] docker-compose.yml with healthchecks and proper dependencies
- [ ] Verify all services start cleanly: `docker compose up -d`

#### Task 0.3: Database Package
- [ ] Write full Prisma schema (all tables from architecture.md)
- [ ] Create initial migration
- [ ] Enable pgvector extension in migration
- [ ] Create HNSW index for embeddings
- [ ] Create GIN indexes for full-text search
- [ ] Create seed script with test users and sample documents
- [ ] Export Prisma client from `packages/database`

### Week 2 Tasks

#### Task 0.4: NestJS API Bootstrapping
- [ ] Create NestJS app with global config module
- [ ] Set up Winston logger (structured JSON)
- [ ] Set up global exception filter
- [ ] Set up request ID interceptor
- [ ] Set up logging interceptor
- [ ] Set up response transform interceptor
- [ ] Set up Swagger/OpenAPI docs at `/api/docs`
- [ ] Set up health check endpoint at `/api/health`
- [ ] Configure CORS for Next.js dev origin
- [ ] Configure Helmet for security headers
- [ ] Configure cookie-parser

#### Task 0.5: Next.js Frontend Bootstrapping
- [ ] Configure Next.js App Router
- [ ] Set up global layout with providers (QueryClientProvider, ThemeProvider)
- [ ] Set up Tailwind CSS with custom design tokens
- [ ] Configure shadcn/ui theme (dark/light mode)
- [ ] Set up Google Fonts (Inter)
- [ ] Create base API client with axios + interceptors
- [ ] Set up TanStack Query client with defaults
- [ ] Create basic route structure (all pages as placeholder)

#### Task 0.6: CI/CD
- [ ] Create `.github/workflows/ci.yml` (lint, type-check, test, build)
- [ ] Configure Turborepo remote caching (optional)
- [ ] Set up branch protection rules
- [ ] Create PR template with checklist

**Phase 0 Exit Criteria:**
- `docker compose up` starts all services without errors
- `npm run dev` starts API on :3001 and web on :3000
- `/api/health` returns `{ status: "ok" }`
- Prisma migrations applied, database ready
- CI pipeline passing on a sample PR

---

## 5. Phase 1: Core Backend (Week 3-6)

### Goals
- Full authentication system working
- Document CRUD API
- Object storage integration
- User management

### Week 3: Authentication

#### Task 1.1: Auth Module

```
apps/api/src/modules/auth/
  auth.module.ts
  auth.controller.ts      # POST /auth/register, /login, /logout, /refresh
  auth.service.ts         # Business logic
  strategies/
    jwt.strategy.ts       # Passport JWT strategy
    local.strategy.ts     # Passport local strategy
    google.strategy.ts    # Passport Google OAuth2 strategy
  guards/
    jwt-auth.guard.ts
    local-auth.guard.ts
    optional-jwt.guard.ts
  dto/
    register.dto.ts
    login.dto.ts
    forgot-password.dto.ts
    reset-password.dto.ts
```

**Implementation Steps:**
- [ ] Create User entity with Argon2id password hashing
- [ ] Implement `register`: validate email uniqueness, hash password, create user
- [ ] Implement `login`: verify password, generate JWT + refresh token, set cookies
- [ ] Implement `logout`: revoke refresh token, clear cookies
- [ ] Implement `refresh`: validate refresh token, rotate tokens
- [ ] Implement `forgot-password`: generate reset token, store hash, return token (email TBD)
- [ ] Implement `reset-password`: validate token, update password, invalidate token
- [ ] Implement Google OAuth scaffold (can be feature-flagged initially)
- [ ] Add rate limiting to auth endpoints
- [ ] Write unit tests for auth service (mock DB)
- [ ] Write integration tests for auth endpoints

#### Task 1.2: JWT Guard & User Decorator

```typescript
// app/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtAccessPayload;
  },
);
```

- [ ] Create `@CurrentUser()` decorator
- [ ] Create `@Public()` decorator for unauthenticated endpoints
- [ ] Apply `JwtAuthGuard` globally, use `@Public()` for unprotected routes
- [ ] Create role-based `@Roles()` guard

### Week 4: Users & Organizations

#### Task 1.3: Users Module
- [ ] `GET /users/me` — Get current user profile
- [ ] `PATCH /users/me` — Update profile (name, preferredLanguage, avatarUrl)
- [ ] `DELETE /users/me` — Soft delete account + schedule data purge
- [ ] `GET /users/me/sessions` — List active sessions
- [ ] `DELETE /users/me/sessions/:id` — Revoke session
- [ ] Profile picture upload to object storage

#### Task 1.4: Organizations Module
- [ ] Create organization
- [ ] List user's organizations
- [ ] Get organization detail
- [ ] Update organization (admin only)
- [ ] Invite member (by email)
- [ ] Accept invitation (token-based)
- [ ] Remove member
- [ ] Change member role
- [ ] Leave organization
- [ ] `OrganizationMemberGuard` for checking membership

### Week 5: Storage Module

#### Task 1.5: Storage Service

```typescript
// apps/api/src/modules/storage/storage.service.ts

@Injectable()
export class StorageService {
  async createPresignedUpload(options: PresignUploadOptions): Promise<PresignedUploadResult>
  async confirmUpload(storageKey: string): Promise<boolean>
  async getPresignedDownloadUrl(storageKey: string, expiresIn: number): Promise<string>
  async deleteObject(storageKey: string): Promise<void>
  async objectExists(storageKey: string): Promise<boolean>
  async getObjectMetadata(storageKey: string): Promise<ObjectMetadata>
}
```

- [ ] Implement `StorageService` backed by `@aws-sdk/client-s3`
- [ ] Configure MinIO as S3 provider in development
- [ ] Implement presigned POST URL generation (with size + type conditions)
- [ ] Implement presigned GET URL generation (time-limited)
- [ ] Implement object existence check
- [ ] Add storage key generator utility with sanitization
- [ ] Create MinIO bucket with lifecycle rules (multipart cleanup)

### Week 6: Documents Module (CRUD)

#### Task 1.6: Documents Module

```typescript
// Core endpoints
POST   /documents              # Initiate upload, get presigned URL
POST   /documents/confirm      # Confirm upload, enqueue processing
GET    /documents              # List with filters
GET    /documents/:id          # Document detail
PATCH  /documents/:id          # Update title, tags
DELETE /documents/:id          # Soft delete
GET    /documents/:id/status   # Processing status
```

- [ ] Create `DocumentsModule` with repository pattern
- [ ] Implement `create`: generate IDs, call storage presign, create DB record
- [ ] Implement `confirmUpload`: verify object in storage, enqueue job, return status
- [ ] Implement `findAll`: paginated list with filters (category, status, date, search)
- [ ] Implement `findById`: with fields, latest version, processing jobs
- [ ] Implement `update`: title, tags, classification override
- [ ] Implement `softDelete`: mark isDeleted, schedule storage cleanup
- [ ] Implement `getStatus`: real-time processing stage and progress
- [ ] Add `DocumentOwnerGuard` to all document endpoints
- [ ] Write integration tests for all document endpoints

**Phase 1 Exit Criteria:**
- User can register, login, logout, refresh tokens
- JWT auth works on protected routes
- Organization CRUD works
- Document can be created and uploaded via presigned URL
- Document can be deleted

---

## 6. Phase 2: Processing Pipeline (Week 7-10)

### Goals
- BullMQ queues operational
- Worker app running as separate process
- All 15 processing stages implemented
- PaddleOCR sidecar integrated
- Processing status visible to client

### Week 7: Queue Infrastructure & Worker App

#### Task 2.1: BullMQ Setup
- [ ] Install BullMQ, `@nestjs/bull`
- [ ] Create `QueueModule` with all queue definitions
- [ ] Configure queue options (retries, backoff, concurrency)
- [ ] Create Bull Board dashboard for monitoring at `/admin/queues`
- [ ] Create `WorkerAppModule` as separate NestJS app
- [ ] Wire Worker app to same Redis instance as API
- [ ] Implement `DeadLetterHandler` for permanent failures
- [ ] Add BullMQ event listeners for progress reporting

#### Task 2.2: Processing Job Service
```typescript
// Tracks pipeline state in PostgreSQL
@Injectable()
export class ProcessingJobService {
  async create(documentId: string, versionId: string): Promise<ProcessingJob>
  async updateStage(jobId: string, update: StageUpdate): Promise<void>
  async markCompleted(jobId: string, metadata: any): Promise<void>
  async markFailed(jobId: string, error: ProcessingError): Promise<void>
  async getByDocument(documentId: string): Promise<ProcessingJob[]>
  async canRetry(jobId: string): Promise<boolean>
}
```

- [ ] Implement all ProcessingJobService methods
- [ ] Store stage history as JSON array for auditability
- [ ] Implement retry count tracking

### Week 8: Pipeline Stages 1-8

#### Task 2.3: Early Pipeline Stages

```
Stage 1: FILE_VALIDATION
  - Recheck file exists in storage
  - Validate file size hasn't changed
  - Re-detect MIME type from magic bytes
  - Validate page count for PDFs

Stage 2: FILE_STORAGE
  - Generate thumbnail for PDF/image
  - Store thumbnail back to MinIO
  - Update document with thumbnail URL

Stage 3: PDF_RENDERING
  - If PDF: convert each page to PNG using pdf2pic or sharp
  - Store rendered pages to MinIO with indexed paths
  - Update DocumentPage records
  - If image: skip, use original as "page 1"

Stage 4: IMAGE_PREPROCESSING
  - For each page image:
    - Deskew (detect and correct rotation)
    - Denoise (bilateral filter or similar)
    - Contrast enhancement (CLAHE)
    - Resize to optimal OCR resolution (300 DPI equivalent)
  - Store preprocessed images (optional — may process in-memory)

Stage 5: OCR
  - For each preprocessed page image:
    - Call OCROrchestrator.processPage()
    - Apply VLM fallback if confidence < threshold
    - Store OcrResult records
    - Accumulate page confidence scores

Stage 6: LANGUAGE_DETECTION
  - For each block: detect script type (Devanagari vs Latin)
  - Aggregate to page language
  - Aggregate to document language
  - Set document.primaryLanguage and secondaryLanguages

Stage 7: DOCUMENT_CLASSIFICATION
  - Concatenate first 2000 chars of OCR text
  - Call LLM with classification prompt
  - Store category, confidence, reasoning
  - Update document.category and categoryConfidence

Stage 8: TEXT_NORMALIZATION
  - Fix common OCR artifacts (broken words, stray characters)
  - Normalize Unicode (NFC form)
  - Fix encoding issues in Devanagari text
  - Preserve original text, store normalized version
```

- [ ] Implement all stage service classes (one class per stage)
- [ ] Stage classes implement `PipelineStage` interface
- [ ] Each stage: update processing job, handle errors, return updated context

### Week 9: Pipeline Stages 9-15

#### Task 2.4: Extraction & Embedding Stages

```
Stage 9: STRUCTURED_EXTRACTION
  - Load extraction schema for document category
  - Prepare LLM prompt with schema and OCR text
  - Call LLM with tool_calling for structured output
  - Parse and validate extracted fields
  - Store DocumentField records

Stage 10: CONFIDENCE_SCORING
  - For each extracted field:
    - Combine LLM confidence with OCR confidence of source block
    - Apply field-type-specific confidence adjustments
    - Set HIGH/MEDIUM/LOW confidence level
  - Calculate overall document confidence score
  - Update document.overallConfidence

Stage 11: VALIDATION
  - Cross-validate fields (e.g., deadline must be after issue_date)
  - Validate field formats (date formats, phone numbers, GST numbers)
  - Flag impossible values for review
  - Mark validated fields

Stage 12: CHUNKING
  - Segment OCR text by headings and paragraphs
  - Detect section boundaries
  - Create chunks of ~500 tokens each
  - Preserve: page_number, section_title, chunk_index
  - Count tokens per chunk
  - Store DocumentChunk records

Stage 13: EMBEDDING
  - For each chunk, call EmbeddingProvider.embed(chunk.content)
  - Batch embed for efficiency (up to 100 chunks per batch)
  - Store DocumentEmbedding records with vector data

Stage 14: INDEXING
  - Update content_tsv for full-text search (trigger handles this)
  - Confirm HNSW index includes new embeddings
  - Create any missing indexes

Stage 15: COMPLETED
  - Mark document status = COMPLETED
  - Update completedAt timestamp
  - Trigger notification job
  - Emit event for real-time update (WebSocket / polling)
```

- [ ] Implement extraction schemas for 5 initial document types
- [ ] Implement chunking strategy (heading-aware, paragraph-aware)
- [ ] Implement batch embedding with rate limiting
- [ ] Implement completion notification

### Week 10: Pipeline Testing & Retry Logic

#### Task 2.5: Worker Robustness
- [ ] Implement idempotency: check current stage before running
- [ ] Implement retry logic with exponential backoff per stage
- [ ] Test pipeline with real sample documents (Hindi govt notice, invoice, certificate)
- [ ] Test pipeline failure scenarios (OCR unavailable, LLM error, DB error)
- [ ] Test retry recovery (job fails halfway, resumes from correct stage)
- [ ] Implement BullMQ job progress reporting (0-100%)
- [ ] Create `/documents/:id/status` endpoint that returns stage progress
- [ ] Stress test: 20 concurrent document uploads

**Phase 2 Exit Criteria:**
- Full 15-stage pipeline runs end-to-end for a Hindi PDF
- OCR results stored in database with correct bounding boxes
- LLM classification and extraction working
- Embeddings stored in pgvector
- Processing status visible in real-time
- Failed jobs retry and recover

---

## 7. Phase 3: AI Intelligence (Week 11-14)

### Goals
- OCR provider abstraction complete
- LLM provider abstraction complete
- Embedding provider abstraction complete
- All extraction schemas implemented
- Confidence scoring refined
- HITL API complete

### Week 11: AI Provider Abstractions

#### Task 3.1: OCR Package
- [ ] Create `packages/ai/src/ocr/ocr.interface.ts`
- [ ] Implement `PaddleOCRProvider`
- [ ] Implement `VLMOCRProvider` (Gemini Vision or Qwen-VL)
- [ ] Implement `OCRProviderFactory` with registration
- [ ] Implement `OCROrchestrator` with confidence-based routing
- [ ] Implement language detection utility (script detection for Devanagari vs Latin)
- [ ] Unit test each provider with mock HTTP responses
- [ ] Integration test with actual PaddleOCR sidecar

#### Task 3.2: LLM Package
- [ ] Create `LLMProvider` interface with all required methods
- [ ] Implement `OpenAIProvider`
- [ ] Implement `GeminiProvider`
- [ ] Implement `AnthropicProvider`
- [ ] Implement `LLMProviderFactory` with circuit breaker
- [ ] Implement `PromptRegistry` for managing prompt templates
- [ ] Implement token counting utilities
- [ ] Add retry logic per provider with provider-specific error handling
- [ ] Unit tests with mocked HTTP clients

#### Task 3.3: Embedding Package
- [ ] Create `EmbeddingProvider` interface
- [ ] Implement `OpenAIEmbeddingProvider`
- [ ] Implement `LocalEmbeddingProvider` (via Python sidecar or ONNX)
- [ ] Implement embedding cache (Redis: hash of text -> embedding)
- [ ] Implement batch processing with rate limiting
- [ ] Unit tests with mocked responses

### Week 12: Extraction Schemas (All Document Types)

#### Task 3.4: Extraction Schema Implementation

For each document type, create:
1. TypeScript type definition
2. Zod validation schema
3. LLM extraction prompt (Hindi + English variants)
4. Field confidence scoring logic
5. Validation rules (cross-field)

Document types to implement:
- [ ] GovernmentNotice (title, authority, notice_number, issue_date, deadline, eligibility, required_docs)
- [ ] Invoice (invoice_number, vendor, gstin, date, due_date, items, subtotal, tax, total)
- [ ] Receipt (merchant, date, items, total, payment_method)
- [ ] Certificate (holder_name, cert_type, cert_number, issue_date, issuing_authority)
- [ ] CollegeDocument (institution, document_type, student_name, date, details)
- [ ] BankDocument (account_number, bank_name, statement_period, transactions)
- [ ] LegalDocument (parties, document_type, date, court, case_number)
- [ ] EmploymentDocument (employee_name, employer, designation, joining_date, ctc)
- [ ] Form (form_number, form_type, fields extracted)
- [ ] Letter (sender, recipient, date, subject, body_summary)

#### Task 3.5: HITL Review API

```
GET    /review                        # List low-confidence fields needing review
GET    /review/stats                  # Total/pending/completed count
POST   /review/:fieldId/accept        # Accept field value as-is
POST   /review/:fieldId/edit          # Edit field value
  body: { newValue: string, reason?: string }
POST   /review/:fieldId/reject        # Reject field entirely
```

- [ ] Implement review queue query (fields where confidence < LOW_CONFIDENCE_THRESHOLD and !isVerified)
- [ ] Implement accept, edit, reject actions with VerificationEvent logging
- [ ] Update document overall status when all low-confidence fields reviewed
- [ ] Implement review stats endpoint

### Week 13: Classification Correction & Analytics

#### Task 3.6: Classification Correction API
- [ ] `PATCH /documents/:id/category` — Override AI classification
- [ ] Store correction in `classification_corrections` table
- [ ] Log audit event
- [ ] Return updated document

#### Task 3.7: Document Comparison Engine
- [ ] Implement field-level diff between two document versions
- [ ] Implement text diff (page-by-page) using `diff` library
- [ ] Implement semantic diff using embedding similarity
- [ ] Create `GET /documents/:id/versions/compare?v1=&v2=` endpoint
- [ ] Return: field_diffs, text_diffs, semantic_summary

### Week 14: Handwriting & Edge Cases

#### Task 3.8: Handwriting Support
- [ ] Implement handwriting detection in OCR output (low confidence + specific block patterns)
- [ ] Route handwriting regions to VLM provider
- [ ] Store `fallback_used: true` in OCR result
- [ ] Test with sample handwritten Hindi forms
- [ ] Handle mixed handwriting + printed text on same page

#### Task 3.9: Edge Cases
- [ ] Handle scanned documents with severe skew (> 15 degrees)
- [ ] Handle multi-column layouts
- [ ] Handle tables (structure detection in OCR blocks)
- [ ] Handle documents with stamps/watermarks obscuring text
- [ ] Implement graceful degradation for very low quality scans

**Phase 3 Exit Criteria:**
- All 10 document type extraction schemas working
- OCR accuracy tested on 20 real Indian documents (> 85% correct)
- HITL review API working end-to-end
- Document comparison producing readable diffs
- Handwriting detection and VLM fallback working

---

## 8. Phase 4: Frontend (Week 11-16)

*(Runs parallel to Phase 3)*

### Goals
- Complete Next.js application with all pages
- Document upload flow
- Document viewer with HITL
- Dashboard with analytics
- Processing status real-time updates

### Week 11-12: Design System & Auth UI

#### Task 4.1: Design System
- [ ] Define color palette (dark mode primary, accent colors)
- [ ] Define typography scale (Inter font)
- [ ] Define spacing scale
- [ ] Create base component library over shadcn/ui:
  - PageLayout (sidebar + main)
  - AppSidebar with navigation
  - LoadingSpinner, Skeleton loaders
  - StatusBadge (processing status)
  - ConfidenceBadge (HIGH/MEDIUM/LOW with colors)
  - DocumentCard
  - EmptyState
  - ErrorBoundary

#### Task 4.2: Auth Pages
- [ ] `/login` — Email + password login form with validation
- [ ] `/register` — Registration form with password strength indicator
- [ ] `/forgot-password` — Email entry for reset
- [ ] `/reset-password` — New password form
- [ ] `AuthProvider` — Client-side auth state management (TanStack Query)
- [ ] Auth redirect logic (middleware.ts for protected routes)
- [ ] Persistent login via refresh token cookie

### Week 13: Dashboard & Document List

#### Task 4.3: Dashboard Page (`/dashboard`)
- [ ] Stats cards: Total docs, Processing, Needs Review, Failed
- [ ] Category breakdown chart (recharts pie chart)
- [ ] Recent uploads list with status indicators
- [ ] Upcoming deadlines widget (extracted from documents)
- [ ] Processing activity timeline
- [ ] Quick upload CTA

#### Task 4.4: Documents List Page (`/documents`)
- [ ] Document grid/list toggle view
- [ ] Filter bar: category, status, language, date range
- [ ] Sort: by date, by name, by category
- [ ] Pagination
- [ ] Document card: thumbnail, title, category badge, status, date, confidence score
- [ ] Inline status updates (polling via TanStack Query)

#### Task 4.5: Upload Flow
- [ ] Drag-and-drop upload zone (react-dropzone)
- [ ] Multi-file upload support
- [ ] Client-side file validation (type, size)
- [ ] Upload to presigned URL (direct to MinIO/S3)
- [ ] Progress tracking per file
- [ ] Upload confirmation call
- [ ] Redirect to document page on success
- [ ] Error handling with retry

### Week 14: Document Detail & Viewer

#### Task 4.6: Document Viewer (`/documents/[id]`)
- [ ] Two-panel layout (responsive: stacked on mobile, side-by-side on desktop)
- [ ] Left panel: PDF/image viewer
  - PDF rendering with react-pdf
  - Page navigation (prev/next, jump to page)
  - Zoom in/out (mouse wheel + buttons)
  - Fit-to-width mode
- [ ] OCR overlay: toggle to show bounding boxes
  - Color-coded by confidence (green/yellow/red)
  - Hover shows text and confidence %
- [ ] Right panel: Document info
  - Category badge with override option
  - Overall confidence score
  - Extracted fields with confidence badges
  - Per-field: value, confidence, source page link, verify/edit/reject actions
  - Processing status indicator
- [ ] Click source page link: left panel jumps to that page
- [ ] Click on OCR region: right panel highlights corresponding field

#### Task 4.7: HITL Verification UI
- [ ] Inline field editor (click to edit value)
- [ ] Accept button (with green checkmark animation)
- [ ] Reject button (with confirmation)
- [ ] Edit popover/dialog with form
- [ ] Confidence tooltip explaining the score
- [ ] Review progress indicator: "X of Y fields verified"
- [ ] "All done" celebration when review queue is empty

### Week 15: Chat Interface

#### Task 4.8: Document Chat (`/documents/[id]/chat`)
- [ ] Chat interface (messages list, input, send button)
- [ ] Streaming response rendering (token-by-token)
- [ ] Language indicator (Hindi/English/Hinglish)
- [ ] Citations panel: shows sources for last answer
- [ ] Citation click: opens document viewer to exact page
- [ ] Conversation history (list of past conversations)
- [ ] New conversation button
- [ ] Empty state with suggested questions

### Week 16: Comparison & Search

#### Task 4.9: Document Comparison (`/documents/[id]/compare`)
- [ ] Version selector (dropdown for v1 and v2)
- [ ] Field diff view: side-by-side changed fields highlighted
- [ ] Text diff view: page-by-page text comparison
- [ ] Semantic summary: "3 key changes detected"
- [ ] Diff legend (added, removed, changed)

#### Task 4.10: Search (`/search`)
- [ ] Search bar with mode selector (Keyword / Semantic / Hybrid)
- [ ] Filter sidebar (category, language, date)
- [ ] Results list with highlighted snippets
- [ ] Click result: open document at specific page
- [ ] No-results state with suggestions

**Phase 4 Exit Criteria:**
- Full user journey works end-to-end in browser
- Upload → Processing → Document view → Chat
- HITL verification flow complete
- Responsive on desktop and tablet
- All pages accessible and functional

---

## 9. Phase 5: Search & RAG (Week 15-18)

*(Overlaps with Phase 4 for backend team)*

### Week 15: Hybrid Search Backend

#### Task 5.1: Search Service
- [ ] Implement `HybridSearchService` with semantic + keyword search
- [ ] Implement score normalization and hybrid scoring
- [ ] Implement search filters (category, language, date, confidence)
- [ ] Implement pagination for search results
- [ ] Implement search result highlighting (snippet extraction)
- [ ] `GET /search` endpoint with all filters
- [ ] Unit tests for scoring logic
- [ ] Performance test: 10K documents, < 300ms response

#### Task 5.2: Language-Aware Search
- [ ] Hindi full-text search using pg_trgm (trigram matching for Devanagari)
- [ ] English full-text search using tsvector plainto_tsquery
- [ ] Mixed-language query handling
- [ ] Query expansion for Hindi synonyms (simple dictionary)
- [ ] Test with Hindi queries: "आधार कार्ड", "अंतिम तारीख"

### Week 16: Conversations Backend

#### Task 5.3: Conversations Module
- [ ] `POST /conversations` — Create conversation (with optional documentId)
- [ ] `GET /conversations/:id` — Get with message history
- [ ] `GET /conversations` — List user's conversations
- [ ] `DELETE /conversations/:id` — Delete conversation + messages

#### Task 5.4: Message Streaming
- [ ] `POST /conversations/:id/messages` — Send message, stream response
- [ ] Implement Server-Sent Events (SSE) for streaming tokens
- [ ] Save user message, generate response, save assistant message
- [ ] Extract and save citations from response

### Week 17: RAG Pipeline

#### Task 5.5: RAG Service
- [ ] Implement `QueryPreprocessor`: language detection, query expansion
- [ ] Implement `HybridRetriever`: orchestrates semantic + keyword search
- [ ] Implement `ResultMerger`: merge and deduplicate results
- [ ] Implement `Reranker`: simple score-based reranking (cross-encoder optional)
- [ ] Implement `ContextBuilder`: token budget management, context formatting
- [ ] Implement `CitationExtractor`: extract source references from LLM response
- [ ] End-to-end test with real Hindi documents

#### Task 5.6: Conversation Context Management
- [ ] Implement conversation history injection (last N turns)
- [ ] Implement token budget for history vs context
- [ ] Implement conversation summarization for long conversations
- [ ] Test multi-turn Hindi conversation maintaining context

### Week 18: Tool-Calling Agent

#### Task 5.7: Document Agent
- [ ] Implement `DocumentAgent` with LLM + tools
- [ ] Implement tool: `search_documents(query, filters)` — hybrid search
- [ ] Implement tool: `get_document(documentId)` — get document metadata
- [ ] Implement tool: `get_document_page(documentId, pageNumber)` — get page content
- [ ] Implement tool: `get_extracted_fields(documentId)` — get structured fields
- [ ] Implement tool: `get_deadlines()` — query deadline fields from DB
- [ ] Implement tool: `list_user_documents(filters)` — list documents with filters
- [ ] Implement tool: `get_documents_by_category(category)` — filter by type
- [ ] Implement tool: `compare_documents(docId1, docId2)` — get comparison
- [ ] Implement tool: `summarize_document(documentId)` — generate summary
- [ ] Implement agent loop (max 5 tool calls per turn)
- [ ] Test with complex multi-step queries

**Phase 5 Exit Criteria:**
- Hybrid search returning relevant results in < 300ms
- RAG chat answering Hindi and English questions with citations
- Tool-calling agent handling structured queries (deadlines, categories)
- Multi-turn conversation context working
- No hallucinations (verified with 20 test queries)

---

## 10. Phase 6: Production Hardening (Week 17-20)

### Week 17: Security & Auth Hardening

#### Task 6.1: Security
- [ ] Implement complete rate limiting (all endpoints from architecture.md)
- [ ] Implement API key authentication for B2B use
- [ ] Add Content Security Policy headers
- [ ] Implement CSRF protection for cookie-based auth
- [ ] Add IP-based rate limiting for auth endpoints
- [ ] Implement account lockout after N failed login attempts
- [ ] Audit all endpoints for missing auth guards
- [ ] Security review of file upload path (magic bytes, file bombs)
- [ ] Penetration test checklist (OWASP Top 10)

#### Task 6.2: Data Privacy
- [ ] Implement account deletion with full data purge (GDPR-style)
- [ ] Implement document content sanitization in logs (PII masking)
- [ ] Add cookie consent banner (for future compliance)
- [ ] Implement data export (user can download their data)

### Week 18: Caching & Performance

#### Task 6.3: Caching
- [ ] Implement Redis caching service with generic `getOrSet`
- [ ] Cache: user profile (5 min)
- [ ] Cache: document fields (10 min, invalidated on HITL update)
- [ ] Cache: search results (5 min per user+query combo)
- [ ] Cache: embeddings (24 hr, keyed by content hash)
- [ ] Cache: document status (30 sec)
- [ ] Profile API endpoints, identify slow queries
- [ ] Add Prisma query optimization (indexes, select only needed fields)
- [ ] Add query explain plans for slow queries

#### Task 6.4: Observability
- [ ] Set up structured logging with Winston (all apps)
- [ ] Implement request tracing with AsyncLocalStorage
- [ ] Add BullMQ job duration metrics
- [ ] Add LLM call duration and token usage tracking
- [ ] Add OCR confidence score tracking
- [ ] Set up error alerting abstraction (Sentry-compatible)
- [ ] Create health check that checks: DB, Redis, Storage, OCR sidecar

### Week 19: Audit Logging

#### Task 6.5: Audit System
- [ ] Implement `AuditService` that all services call to log events
- [ ] Define all audit event types (AuthEventType, DocumentEventType, etc.)
- [ ] Instrument all important service methods with audit calls
- [ ] `GET /audit-logs` endpoint (admin only, paginated, filterable)
- [ ] Add audit log viewer to admin dashboard
- [ ] Test: every user action appears in audit log

### Week 20: Load Testing & Stability

#### Task 6.6: Testing at Scale
- [ ] Load test API with k6: 100 concurrent users, document upload
- [ ] Load test chat endpoint: 50 concurrent streaming responses
- [ ] Load test search: 200 concurrent hybrid search queries
- [ ] Stress test processing pipeline: 50 simultaneous uploads
- [ ] Fix all issues found during load testing
- [ ] Implement circuit breaker for LLM provider calls
- [ ] Implement graceful degradation: if LLM unavailable, OCR-only mode

**Phase 6 Exit Criteria:**
- All OWASP Top 10 vulnerabilities addressed
- Rate limiting working correctly
- Audit log capturing all events
- System stable under 100 concurrent user load
- P95 latency meets targets from architecture.md
- Health check monitoring all services

---

## 11. Phase 7: Advanced Features (Week 19-24)

### Week 19-20: Document Versioning UI

- [ ] Version list in document detail sidebar
- [ ] "Upload New Version" button with upload flow
- [ ] Version comparison UI (`/documents/[id]/compare`)
- [ ] Visual diff rendering (added/removed/changed highlighted)
- [ ] Semantic change summary generation

### Week 21-22: Multi-Document Chat

- [ ] Cross-document conversation (no documentId filter in RAG)
- [ ] "Documents in context" panel in chat
- [ ] Tool: `list_user_documents` with natural language filters
- [ ] Test: "Find all invoices from August 2026 and calculate total amount"

### Week 23-24: API & Webhooks (B2B)

- [ ] API key management UI in settings
- [ ] API key authentication guard
- [ ] Webhook registration (document.completed, document.failed, review.required)
- [ ] Webhook delivery with retry (use BullMQ notification queue)
- [ ] API documentation (Swagger) complete and accurate
- [ ] Rate limits for API key access
- [ ] SDK generation (TypeScript) from OpenAPI spec

---

## 12. Testing Strategy

### 12.1 Test Types

| Test Type | Tool | Coverage Target | When |
|---|---|---|---|
| Unit tests | Jest | 80% of services | Every PR |
| Integration tests | Jest + Supertest | All API endpoints | Every PR |
| E2E tests | Playwright | Critical user flows | Before release |
| Load tests | k6 | Core endpoints | Phase 6 |
| AI quality tests | Custom eval | OCR, extraction, RAG | After AI changes |

### 12.2 AI Quality Evaluation

For OCR and LLM extraction, standard unit tests are insufficient. Implement:

```typescript
// Test evaluation harness
interface AITestCase {
  inputFile: string;           // Path to test document
  expectedCategory: DocumentCategory;
  expectedFields: Record<string, { value: string; minConfidence: number }>;
  expectedOcrAccuracy: number; // Min CER (Character Error Rate)
}

const testCases: AITestCase[] = [
  {
    inputFile: 'tests/fixtures/scholarship_notice_hindi.pdf',
    expectedCategory: 'GOVERNMENT_NOTICE',
    expectedFields: {
      deadline: { value: '2026-08-20', minConfidence: 0.8 },
      issuing_authority: { value: 'Bihar Government', minConfidence: 0.75 },
    },
    expectedOcrAccuracy: 0.88,
  },
  // More test cases...
];
```

Maintain a `tests/fixtures/` directory with 20+ real Indian document samples (anonymized/synthetic) for evaluation.

### 12.3 Unit Test Pattern

```typescript
// Service tests use in-memory mocks
describe('DocumentsService', () => {
  let service: DocumentsService;
  let mockDocumentRepo: jest.Mocked<DocumentsRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: DocumentsRepository, useValue: createMock<DocumentsRepository>() },
        { provide: StorageService, useValue: createMock<StorageService>() },
        { provide: QueueService, useValue: createMock<QueueService>() },
      ],
    }).compile();

    service = module.get(DocumentsService);
    mockDocumentRepo = module.get(DocumentsRepository);
  });

  it('should create a document and presigned URL', async () => {
    // arrange
    mockDocumentRepo.create.mockResolvedValue(mockDocument);
    // act
    const result = await service.initiateUpload(mockUserId, mockCreateDto);
    // assert
    expect(result.documentId).toBe(mockDocument.id);
    expect(result.uploadUrl).toBeTruthy();
  });
});
```

### 12.4 Integration Test Pattern

```typescript
// API integration tests use real in-memory SQLite or PostgreSQL test DB
describe('POST /api/v1/documents', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ ... }).compile();
    app = module.createNestApplication();
    // ... setup
    await app.init();
    jwtToken = await loginAndGetToken();
  });

  it('should return document ID and presigned URL', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ fileName: 'test.pdf', mimeType: 'application/pdf', fileSize: 1000 })
      .expect(201);

    expect(response.body.data.documentId).toBeDefined();
    expect(response.body.data.uploadUrl).toBeDefined();
    expect(response.body.data.status).toBe('QUEUED');
  });
});
```

---

## 13. Deployment Strategy

### 13.1 Development Deployment

- All services via `docker compose up`
- API and Web in watch mode (`npm run dev`)
- Hot reload for both API and Frontend

### 13.2 Staging Deployment

- Docker Compose on a single VM (DigitalOcean Droplet or AWS EC2)
- GitHub Actions CD pipeline: push to `develop` -> deploy to staging
- Caddy or nginx for SSL termination
- Environment variables from GitHub Secrets

### 13.3 Production Deployment (Phase 6+)

**Option A: Single Server (Budget)**
- Docker Compose on a powerful VM (8 vCPU, 32GB RAM)
- Suitable for: < 1000 concurrent users
- Cost: ~$200/month (DigitalOcean)
- PaddleOCR sidecar with GPU (DigitalOcean GPU Droplet)

**Option B: Kubernetes (Scale)**
- EKS / GKE with managed node groups
- PostgreSQL on RDS (managed)
- Redis on ElastiCache
- S3 for storage
- ECR for container registry
- ALB for load balancing
- Suitable for: > 1000 concurrent users
- Cost: ~$800-1500/month

### 13.4 Database Migration Strategy

```bash
# Never run prisma migrate deploy in production without review
# Always generate SQL first, review, then apply

# Development
npx prisma migrate dev --name <migration_name>

# Production (CI/CD pipeline)
npx prisma migrate deploy  # Only applies pending migrations, no schema push

# Rollback (manual): PostgreSQL transaction rollback
# Keep migration files in git history for audit
```

---

## 14. Technical Decisions & Tradeoffs

### 14.1 NestJS vs Fastify

**Decision: NestJS**

Rationale:
- Built-in dependency injection makes the modular architecture clean
- Excellent BullMQ integration via `@nestjs/bull`
- Passport.js integration for auth strategies
- Swagger integration
- Strong TypeScript support

Tradeoff: Slightly more overhead than Fastify, but acceptable for our use case.

### 14.2 Prisma vs Drizzle ORM

**Decision: Prisma**

Rationale:
- Type-safe generated client
- Excellent migration tooling
- Works well with pgvector via `$queryRaw` for vector operations
- Better ecosystem for our team

Tradeoff: Prisma's raw SQL (`$queryRaw`) is needed for pgvector operations, which reduces type safety there. This is acceptable given pgvector queries are isolated in repository classes.

### 14.3 pgvector vs Dedicated Vector DB (Pinecone, Weaviate)

**Decision: pgvector**

Rationale:
- Keeps all data in one system (no cross-database consistency issues)
- Simpler operational complexity
- Sufficient performance for our scale (< 10M embeddings in year 1)
- PostgreSQL HNSW index performance is excellent for this scale
- Avoids additional infrastructure cost

Tradeoff: At 100M+ embeddings, a dedicated vector DB might be faster. Mitigation: design embedding service as a provider abstraction so this can be swapped later.

### 14.4 PaddleOCR as Sidecar vs Cloud OCR API

**Decision: PaddleOCR Sidecar (with cloud fallback)**

Rationale:
- Best Devanagari OCR accuracy in open source
- No per-page API cost (critical for price-sensitive Indian market)
- Can run on GPU for speed
- Full control over model versions

Tradeoff: Operational complexity (Python service, model downloads). Mitigation: Docker container with pre-downloaded models.

### 14.5 SSE vs WebSocket for Chat Streaming

**Decision: Server-Sent Events (SSE)**

Rationale:
- One-directional (server -> client) — perfect for token streaming
- Works through HTTP/2 multiplexing
- Native browser support (EventSource API)
- Simpler than WebSocket for this use case
- Works better with Next.js API routes

Tradeoff: No bidirectional communication. Mitigation: Chat messages sent via regular POST, responses streamed via SSE.

---

## 15. Definition of Done

### Feature-Level DoD

A feature is "done" when:
- [ ] Code implemented with TypeScript strict mode, no `any` types
- [ ] Unit tests written and passing (>= 80% branch coverage for the feature)
- [ ] Integration tests for API endpoints
- [ ] OpenAPI documentation updated
- [ ] No new ESLint errors or warnings
- [ ] No new TypeScript errors
- [ ] Code reviewed by at least one other engineer
- [ ] Feature flag added if incomplete or risky
- [ ] Logging instrumented for key operations
- [ ] Error cases handled with appropriate HTTP status codes
- [ ] Rate limiting applied if user-facing endpoint

### Release-Level DoD

A release is "done" when:
- [ ] All planned features are feature-complete
- [ ] All automated tests passing in CI
- [ ] Load test passed (P95 latency meets targets)
- [ ] Security checklist passed
- [ ] Database migrations tested on production-like data
- [ ] Runbook updated with new operations procedures
- [ ] Monitoring dashboards updated for new features
- [ ] Changelog written

---

## 16. Task Breakdown (Granular)

### Sprint 1 (Week 1-2): Phase 0
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| Monorepo init (Turborepo, TS config, ESLint) | TL | 1 | P0 |
| Docker Compose (PG, Redis, MinIO, PaddleOCR) | TL/DevOps | 2 | P0 |
| PaddleOCR sidecar Dockerfile | AI Eng | 2 | P0 |
| Prisma schema (complete) | Backend | 2 | P0 |
| Initial migration + seed | Backend | 0.5 | P0 |
| NestJS bootstrapping + global middleware | Backend | 1 | P0 |
| Next.js setup + shadcn/ui | Frontend | 1 | P0 |
| packages/shared, config, types | TL | 1 | P0 |
| CI pipeline (GitHub Actions) | DevOps | 0.5 | P1 |
| .env.example documentation | TL | 0.5 | P1 |

### Sprint 2 (Week 3-4): Phase 1 Auth
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| Auth service (register, login, logout, refresh) | Backend | 3 | P0 |
| JWT strategy + guards | Backend | 1 | P0 |
| Google OAuth scaffold | Backend | 1 | P1 |
| Rate limiting (auth endpoints) | Backend | 0.5 | P0 |
| Auth unit tests | Backend | 1 | P0 |
| Auth integration tests | Backend | 1 | P0 |
| Users module (profile CRUD) | Backend | 1 | P1 |
| Login/Register pages | Frontend | 2 | P0 |
| Auth state management | Frontend | 1 | P0 |

### Sprint 3 (Week 5-6): Phase 1 Documents
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| Storage service (MinIO/S3) | Backend | 2 | P0 |
| Documents module CRUD | Backend | 3 | P0 |
| Presigned upload endpoint | Backend | 1 | P0 |
| DocumentOwnerGuard | Backend | 0.5 | P0 |
| Documents integration tests | Backend | 1 | P0 |
| Organizations module | Backend | 2 | P1 |
| Organizations integration tests | Backend | 1 | P1 |

### Sprint 4 (Week 7-8): Phase 2 Pipeline Early Stages
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| BullMQ setup + Worker app | Backend | 2 | P0 |
| ProcessingJobService | Backend | 1 | P0 |
| Stages 1-4 (validation, storage, PDF, preprocess) | Backend | 3 | P0 |
| PaddleOCR provider integration | AI Eng | 2 | P0 |
| Stage 5-6 (OCR, language detection) | AI Eng | 2 | P0 |
| Stage 7 (classification) | AI Eng | 1 | P0 |
| Stage 8 (normalization) | AI Eng | 1 | P1 |

### Sprint 5 (Week 9-10): Phase 2 Pipeline Later Stages
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| Extraction schemas (5 doc types) | AI Eng | 3 | P0 |
| Stage 9-11 (extraction, scoring, validation) | AI Eng | 3 | P0 |
| Chunking service | Backend | 1 | P0 |
| Stage 12-14 (chunking, embedding, indexing) | Backend + AI | 2 | P0 |
| Stage 15 (completion + notification) | Backend | 0.5 | P0 |
| Pipeline end-to-end testing | All | 2 | P0 |

### Sprint 6 (Week 11-12): Phase 3+4 Parallel
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| LLM provider abstraction (OpenAI, Gemini) | AI Eng | 2 | P0 |
| Embedding provider abstraction | AI Eng | 1 | P0 |
| VLM OCR fallback | AI Eng | 2 | P1 |
| Design system + components | Frontend | 2 | P0 |
| Dashboard page | Frontend | 2 | P0 |
| Document list page | Frontend | 1 | P0 |
| Upload flow UI | Frontend | 2 | P0 |

### Sprint 7 (Week 13-14): Phase 4 Viewer + HITL
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| Remaining extraction schemas (5 more types) | AI Eng | 2 | P1 |
| HITL review API | Backend | 2 | P0 |
| Document comparison engine | AI Eng | 3 | P1 |
| Document viewer (split panel + PDF) | Frontend | 3 | P0 |
| OCR overlay on document image | Frontend | 2 | P1 |
| HITL verification UI | Frontend | 2 | P0 |

### Sprint 8 (Week 15-16): Phase 5 Search + Chat
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| Hybrid search service | Backend | 2 | P0 |
| Search API endpoint | Backend | 1 | P0 |
| Search page UI | Frontend | 2 | P0 |
| Conversations module | Backend | 1 | P0 |
| SSE streaming endpoint | Backend | 2 | P0 |
| Chat UI | Frontend | 3 | P0 |

### Sprint 9 (Week 17-18): Phase 5 RAG + Phase 6 Start
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| RAG service (retriever, context builder) | AI Eng | 3 | P0 |
| Citation extraction | AI Eng | 1 | P0 |
| Tool-calling agent | AI Eng | 3 | P0 |
| Rate limiting (all endpoints) | Backend | 2 | P0 |
| Caching layer (Redis) | Backend | 2 | P0 |

### Sprint 10 (Week 19-20): Phase 6 Hardening
| Task | Owner | Est. Days | Priority |
|---|---|---|---|
| Audit logging | Backend | 2 | P0 |
| Security review + OWASP | All | 2 | P0 |
| Load testing | DevOps | 2 | P0 |
| Observability setup | DevOps | 2 | P1 |
| Production Docker Compose | DevOps | 1 | P0 |
| CI/CD deployment pipeline | DevOps | 2 | P0 |

---

*Implementation Plan — DocSaarthi v1.0.0*
*Last updated: August 2026*
*Next review: After Phase 0 completion*
