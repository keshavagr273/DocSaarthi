# DocSaarthi — Project Checkpoints

> **Version:** 1.0.0
> **Date:** August 2026
> **Purpose:** Ordered execution guide — build these 5 checkpoints in sequence to produce a fully working production-grade DocSaarthi application.

---

## How to Use This Document

Each checkpoint is a **self-contained vertical slice** of the product. When a checkpoint is complete, the system should be fully functional up to that point — you should be able to demo it, test it end-to-end, and show it to a real user.

**Do not start Checkpoint 2 until Checkpoint 1 is fully working and verified.**

Each checkpoint section contains:
- **What to build** — exact components, files, modules, and features
- **What the final output looks like** — what a user sees, what the API returns, what the database contains
- **Acceptance criteria** — specific tests and checks to pass before moving on
- **Definition of Done** — the precise bar for "this checkpoint is complete"

---

## Checkpoint Overview

| # | Name | Duration | Core Deliverable |
|---|---|---|---|
| 1 | Infrastructure & Foundation | Week 1-3 | Everything runs locally, auth works, files can be uploaded |
| 2 | Document Processing Pipeline | Week 4-7 | Uploaded documents get OCR'd, classified, and fields extracted |
| 3 | Intelligence & Verification | Week 8-11 | Extracted data is accurate, confidence-scored, and verifiable |
| 4 | Search, RAG & Conversational AI | Week 12-16 | Users can chat with documents in Hindi and English |
| 5 | Polish, Security & Production | Week 17-20 | System is secure, fast, observable, and deployable to production |

---

---

# CHECKPOINT 1

## Infrastructure, Auth & Document Upload

**Theme:** "Before AI can do anything, the plumbing must work perfectly."

**Duration:** 3 weeks

---

## 1.1 What to Build

### A. Monorepo & Tooling

Create the entire project skeleton. Every subsequent feature builds on this.

**Files and structure to create:**

```
docsaarthi/
├── apps/
│   ├── api/                    ← NestJS application
│   ├── worker/                 ← NestJS worker (BullMQ processors)
│   └── web/                    ← Next.js 15 application
├── packages/
│   ├── shared/                 ← Shared TypeScript types, constants, utils
│   ├── database/               ← Prisma schema, client, migrations
│   ├── config/                 ← Zod-validated environment config
│   └── types/                  ← Domain-specific TypeScript types
├── infra/
│   ├── docker/
│   │   ├── postgres/init.sql   ← pgvector extension, DB setup
│   │   ├── redis/redis.conf
│   │   └── minio/init.sh       ← Bucket creation script
│   └── docker-compose.yml
├── turbo.json
├── package.json                ← Workspaces config
├── tsconfig.base.json
├── .env.example
└── .gitignore
```

**Tooling requirements:**
- Turborepo configured for `dev`, `build`, `test`, `lint` tasks
- TypeScript strict mode on for all packages
- ESLint with shared config across all apps
- Prettier formatting
- `npm run docker:up` command starts all infrastructure

---

### B. Infrastructure (Docker Compose)

All services must start with a single command: `docker compose up -d`

**Services to containerize:**

1. **PostgreSQL 16 with pgvector**
   - Image: `pgvector/pgvector:pg16`
   - Init script creates: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Init script creates: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
   - Database: `docsaarthi`, User: `docsaarthi`
   - Health check: `pg_isready`

2. **Redis 7**
   - Image: `redis:7-alpine`
   - Persistence: AOF enabled
   - Health check: `redis-cli ping`

3. **MinIO**
   - Image: `minio/minio`
   - Console at `:9001`
   - API at `:9000`
   - Auto-create bucket: `docsaarthi`
   - Bucket policy: private (no public access)

4. **PaddleOCR Sidecar** (Python FastAPI service)
   - Dockerfile in `infra/docker/paddle-ocr/`
   - Python 3.10, PaddleOCR installed
   - FastAPI server at `:8081`
   - Single endpoint: `POST /ocr` accepts image path, returns OCR results
   - Health check endpoint: `GET /health`
   - Pre-downloads PaddleOCR English+Hindi models in Docker build

---

### C. Database Schema (Complete)

Run `npx prisma migrate dev` and all tables must be created:

**Tables to create:**
- `users` — email, passwordHash, name, role, preferredLanguage
- `sessions` — userId, userAgent, ipAddress, expiresAt
- `refresh_tokens` — userId, tokenHash, sessionId, isRevoked, expiresAt
- `oauth_accounts` — userId, provider, providerUserId
- `organizations` — name, slug, logoUrl, plan
- `organization_members` — organizationId, userId, role
- `documents` — userId, organizationId, title, originalFileName, mimeType, status, category
- `document_versions` — documentId, versionNumber, storageKey, processingStatus, processingStage
- `document_pages` — versionId, pageNumber, storageKey, width, height
- `ocr_results` — versionId, pageId, pageNumber, rawText, blocks (JSON), ocrProvider
- `document_chunks` — versionId, chunkIndex, content, pageNumber, sectionTitle, tokenCount
- `document_embeddings` — chunkId, embedding (vector 1536), model
- `document_fields` — documentId, fieldName, fieldType, rawValue, confidence, confidenceLevel
- `document_version_fields` — versionId, fieldName, rawValue, confidence
- `processing_jobs` — documentId, versionId, status, currentStage, stageHistory (JSON)
- `conversations` — userId, documentId, title, language
- `messages` — conversationId, role, content, language
- `citations` — messageId, chunkId, documentId, pageNumber
- `verification_events` — fieldId, userId, action (ACCEPTED/EDITED/REJECTED)
- `classification_corrections` — documentId, aiCategory, userCategory
- `audit_logs` — eventType, actorId, resourceType, resourceId, changes (JSON)
- `api_keys` — userId, name, keyHash, keyPrefix, scopes

**Indexes to create:**
- HNSW index on `document_embeddings.embedding` for vector search
- GIN index on `document_chunks.content_tsv` for full-text search
- GIN trigram index on `document_chunks.content` for Hindi search
- Composite indexes on all common query patterns

---

### D. NestJS API Application

**Global configuration:**
- `ConfigModule` (global) — reads `.env`, validates with Zod schema
- `DatabaseModule` (global) — Prisma client singleton
- `LoggerModule` (global) — Winston structured JSON logger
- `RedisModule` (global) — ioredis client singleton

**Global middleware (applied to all routes):**
- `RequestIdInterceptor` — generates UUID per request, sets `X-Request-Id` header
- `LoggingInterceptor` — logs every request with method, path, status, duration, requestId
- `TransformInterceptor` — wraps all responses: `{ data: ..., meta: { requestId, timestamp } }`
- `GlobalExceptionFilter` — catches all errors, formats error response: `{ error: { code, message, requestId } }`
- `helmet()` — sets security headers (CSP, HSTS, X-Frame-Options, etc.)
- `cookie-parser()` — enables cookie reading
- CORS configured for `http://localhost:3000`

**Swagger/OpenAPI:**
- Available at `GET /api/docs`
- All endpoints documented with DTOs
- Authentication via Bearer token in Swagger UI

**Health check:**
- `GET /api/health` — checks DB, Redis, MinIO connectivity
- Returns: `{ status: "ok", services: { database: "ok", redis: "ok", storage: "ok" } }`

---

### E. Authentication System

The most critical security foundation of the entire application.

**Endpoints to implement:**

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
GET  /api/v1/auth/me
```

**Registration (`POST /api/v1/auth/register`):**
- Validate: email format, password minimum 8 chars, name required
- Check email uniqueness (case-insensitive)
- Hash password with Argon2id (memory: 64MB, iterations: 3, parallelism: 1)
- Create user record
- Generate access token (JWT, 15 min expiry, signed with `ACCESS_TOKEN_SECRET`)
- Generate refresh token (64-byte random hex, store SHA-256 hash in DB, 7-day expiry)
- Set cookies: `access_token` (15min) and `refresh_token` (7 days)
- Both cookies: HttpOnly, Secure, SameSite=Strict
- `refresh_token` cookie path: `/api/v1/auth/refresh` (only sent on refresh endpoint)
- Return: `{ user: { id, email, name, role } }` — NO tokens in response body

**Login (`POST /api/v1/auth/login`):**
- Validate email + password
- Find user by email (case-insensitive)
- Verify password with Argon2 (constant-time comparison)
- On wrong password: return 401, DO NOT indicate whether email exists
- On success: generate new access + refresh tokens, set cookies
- Update `lastLoginAt` timestamp
- Create Session record with IP and user agent
- Log audit event: `AUTH_LOGIN_SUCCESS`
- Return: `{ user: { id, email, name, role } }`

**Logout (`POST /api/v1/auth/logout`):**
- Read refresh token from cookie
- Hash it, find in DB, mark `isRevoked = true`
- Delete session record
- Clear both cookies (set to expired)
- Log audit event: `AUTH_LOGOUT`
- Return: 204 No Content

**Refresh (`POST /api/v1/auth/refresh`):**
- Read refresh token from HttpOnly cookie
- Hash it, verify in DB: exists, not revoked, not expired
- Generate new access token AND new refresh token (token rotation)
- Revoke old refresh token, create new one in DB
- Set new cookies
- Return: `{ user: { id, email, name, role } }`

**JWT Guard (`JwtAuthGuard`):**
- Applied globally to all routes
- Routes decorated with `@Public()` skip the guard
- Validates JWT signature and expiry
- Attaches `{ sub, email, role, sessionId }` to `request.user`
- On invalid token: 401 Unauthorized

**Rate Limiting on Auth endpoints:**
- `POST /auth/register`: 5 per hour per IP
- `POST /auth/login`: 5 per 15 minutes per IP
- `POST /auth/forgot-password`: 3 per hour per email
- Implemented via Redis sliding window counter

---

### F. Document Upload API

**Endpoints to implement:**

```
POST /api/v1/documents               ← Initiate upload, returns presigned URL
POST /api/v1/documents/:id/confirm   ← Confirm upload complete, enqueue job
GET  /api/v1/documents               ← List user's documents (paginated)
GET  /api/v1/documents/:id           ← Get document detail
GET  /api/v1/documents/:id/status    ← Get processing status
PATCH /api/v1/documents/:id          ← Update title, tags
DELETE /api/v1/documents/:id         ← Soft delete
```

**Initiate Upload (`POST /api/v1/documents`):**
- Body: `{ fileName, mimeType, fileSize, title? }`
- Validate mimeType: only `application/pdf`, `image/png`, `image/jpeg`, `image/webp`
- Validate fileSize: max 50MB (configurable via env)
- Sanitize fileName: replace special characters, keep extension
- Generate: `documentId` (cuid), `versionId` (cuid)
- Generate storageKey: `documents/{userId}/{documentId}/{versionId}/original/{sanitizedFileName}`
- Create Document record in DB (status: QUEUED)
- Create DocumentVersion record in DB (status: QUEUED)
- Call MinIO SDK to generate presigned POST URL (valid for 1 hour)
  - Include conditions: `content-type` must match declared type, `content-length-range`
- Return:
  ```json
  {
    "data": {
      "documentId": "...",
      "versionId": "...",
      "uploadUrl": "http://localhost:9000/docsaarthi/...",
      "uploadFields": { "key": "...", "Policy": "...", ... },
      "expiresAt": "2026-08-19T02:00:00Z"
    }
  }
  ```

**Confirm Upload (`POST /api/v1/documents/:id/confirm`):**
- Body: `{ versionId }`
- Verify ownership: document belongs to authenticated user
- HEAD request to MinIO to verify file actually exists at storageKey
- If file not found: return 422 "Upload not completed"
- Get file metadata from MinIO: actual size, ETag
- Server-side MIME type detection from file magic bytes (use `file-type` library)
- Validate detected MIME matches declared MIME — if mismatch: reject, delete file from MinIO, return 400
- Update document and version: set storageUrl, checksum (ETag), fileSize (actual)
- Enqueue BullMQ job on `document-processing` queue:
  ```json
  {
    "documentId": "...",
    "versionId": "...",
    "userId": "...",
    "storageKey": "..."
  }
  ```
- Return:
  ```json
  {
    "data": {
      "documentId": "...",
      "status": "QUEUED",
      "message": "Document queued for processing"
    }
  }
  ```

**List Documents (`GET /api/v1/documents`):**
- Query params: `page`, `limit`, `category`, `status`, `search`, `sortBy`, `sortOrder`
- Always filter by `userId = currentUser.id` and `isDeleted = false`
- Return paginated results:
  ```json
  {
    "data": {
      "documents": [...],
      "pagination": {
        "total": 47,
        "page": 1,
        "limit": 20,
        "totalPages": 3
      }
    }
  }
  ```

**Document Status (`GET /api/v1/documents/:id/status`):**
- Returns current processing state:
  ```json
  {
    "data": {
      "documentId": "...",
      "status": "PROCESSING",
      "currentStage": "OCR",
      "completedStages": ["FILE_VALIDATION", "FILE_STORAGE", "PDF_RENDERING", "IMAGE_PREPROCESSING"],
      "progress": 40,
      "startedAt": "2026-08-19T00:00:00Z",
      "estimatedCompletion": "2026-08-19T00:01:30Z"
    }
  }
  ```

---

### G. BullMQ Worker Setup

**Separate NestJS application** (`apps/worker/`) that runs as its own process.

**What to configure:**
- BullMQ connected to same Redis instance as API
- Register queue: `document-processing` (the only queue needed for Checkpoint 1)
- Register processor: `DocumentProcessor` on the `document-processing` queue
- Concurrency: 5 (configurable via env)
- For Checkpoint 1, the processor just logs that it received the job and updates status
- Full pipeline processing is built in Checkpoint 2

**Worker startup:**
- `npm run dev` in `apps/worker/` starts the worker
- Worker logs: "Worker started. Listening on queues: document-processing"
- Worker logs each received job: `"Processing job {jobId} for document {documentId}"`

---

### H. Next.js Frontend (Auth + Upload)

**Pages to build:**

#### `/login`
- Clean, centered card layout on a dark/gradient background
- Email and password fields with React Hook Form + Zod validation
- Show/hide password toggle
- "Forgot password?" link
- Submit button with loading spinner
- Error message display (wrong credentials, server error)
- On success: redirect to `/dashboard`
- "Don't have an account? Register" link

#### `/register`
- Same layout as login
- Fields: Full name, Email, Password, Confirm Password
- Password strength indicator (weak/medium/strong)
- Email and password validation messages inline
- On success: redirect to `/dashboard`

#### `/dashboard`
- Protected route (redirect to `/login` if not authenticated)
- Sidebar navigation (persistent on desktop, drawer on mobile)
- Top navbar with user avatar dropdown (logout option)
- Main content area showing:
  - Welcome message: "Welcome back, {name}"
  - Stats cards: Total Documents (0), Processing (0), Completed (0), Needs Review (0)
  - Empty state: "You haven't uploaded any documents yet. Upload your first document."
  - Upload button / drag-and-drop zone

#### `/documents`
- Document list page
- Filter bar (category dropdown, status dropdown, date range picker)
- Document cards grid/list toggle
- Empty state when no documents
- Each document card shows: title, category badge, status badge, upload date, page count
- Click card → go to `/documents/:id`

#### Upload Flow (Modal or Page at `/documents/upload`)
- Drag-and-drop zone (react-dropzone)
- Accept: PDF, PNG, JPG, JPEG, WEBP
- Max file size display: "Max 50MB"
- Client-side validation before upload starts
- Upload progress bar (percentage)
- Status transitions: "Selecting file → Uploading → Queued for processing"
- On success: show "Document uploaded successfully!" and redirect to document page

#### Auth State Management
- `useAuth()` hook that reads user from TanStack Query
- Axios interceptor that reads access token from cookie automatically (HttpOnly cookies sent automatically)
- On 401 response: auto-call refresh endpoint, retry original request
- If refresh fails: redirect to `/login`
- `middleware.ts` in Next.js: protect all `/dashboard`, `/documents`, `/search`, `/settings` routes

---

## 1.2 What the Final Output Looks Like

When Checkpoint 1 is complete, you can perform this exact demo:

**Demo Flow:**
1. Open browser at `http://localhost:3000`
2. You are redirected to `/login` (not authenticated)
3. Click "Register" → fill form → click Submit
4. You land on `/dashboard` — empty state, "Upload your first document"
5. Click "Upload Document" → drag a PDF onto the dropzone
6. Progress bar goes from 0% → 100%
7. Success message: "Document uploaded successfully!"
8. Redirect to `/documents/doc_xyz123` — document detail page shows status "QUEUED"
9. Status page shows: "Your document is in the queue for processing"
10. Open MinIO console at `http://localhost:9001` — you see the file stored there
11. Check PostgreSQL: `SELECT * FROM documents;` — 1 row with status QUEUED
12. Check BullMQ: worker logs show "Received job for document doc_xyz123"
13. Logout → you are back at `/login`
14. Login again → you see your document in the list

**What the database contains after this demo:**
```sql
-- users table
SELECT id, email, name, role FROM users;
-- 1 row: your test user

-- documents table
SELECT id, title, status, mime_type, file_size_bytes FROM documents;
-- 1 row: status = 'QUEUED', file details correct

-- document_versions table
SELECT id, document_id, version_number, storage_key FROM document_versions;
-- 1 row: storage_key points to MinIO path

-- refresh_tokens table
SELECT token_hash, is_revoked, expires_at FROM refresh_tokens;
-- 1 active token

-- audit_logs table
SELECT event_type, actor_id, created_at FROM audit_logs;
-- AUTH_REGISTER, AUTH_LOGIN_SUCCESS events
```

---

## 1.3 Acceptance Criteria

All of these must pass before proceeding to Checkpoint 2:

- [ ] `docker compose up -d` starts all 4 services with no errors
- [ ] `GET http://localhost:3001/api/health` returns `{ status: "ok" }`
- [ ] `GET http://localhost:3001/api/docs` shows Swagger UI with all endpoints
- [ ] `npm run db:migrate` runs without errors, all 22 tables created
- [ ] User can register with email/password — JWT set in HttpOnly cookie
- [ ] Protected routes return 401 without valid JWT
- [ ] Tokens expire: access token after 15 min, refresh token after 7 days
- [ ] Refresh endpoint issues new tokens and rotates refresh token
- [ ] Logout revokes refresh token and clears cookies
- [ ] Rate limiting blocks > 5 login attempts in 15 minutes from same IP
- [ ] File upload to presigned URL stores file in MinIO
- [ ] Confirm upload validates MIME type via magic bytes (cannot fake by changing extension)
- [ ] After confirm, BullMQ job appears in queue (visible in Bull Board dashboard)
- [ ] Worker receives and logs the job
- [ ] Document status endpoint returns QUEUED status
- [ ] Frontend login/register pages work without console errors
- [ ] Upload flow completes with progress bar and success message
- [ ] Logout button works and clears session

---

---

# CHECKPOINT 2

## Document Processing Pipeline

**Theme:** "The document goes in as a file. It comes out as structured data."

**Duration:** 4 weeks

---

## 2.1 What to Build

### A. Complete 15-Stage Async Pipeline

Every stage runs in the BullMQ worker. Each stage:
1. Updates `processing_jobs.currentStage` at start
2. Stores result in database
3. Passes results forward via pipeline context
4. On failure: records error, increments retry count, re-throws for BullMQ retry

**Stages to implement in the Worker:**

#### Stage 1: FILE_VALIDATION
- Download file metadata from MinIO (HEAD request, don't download full file)
- Verify file exists and size matches stored size
- Check `checksum` (ETag) matches what was recorded at upload
- If PDF: validate it can be opened (use `pdfjs-dist` to count pages)
- If page count > 100: fail with `MAX_PAGES_EXCEEDED` error code
- If file appears corrupted: fail with `CORRUPTED_FILE` error code
- Store validated page count in `document_versions.pageCount`
- Update stage status to COMPLETED

#### Stage 2: FILE_STORAGE
- Generate thumbnail:
  - For PDF: render first page at low resolution (150 DPI) using `pdf2pic`
  - For images: resize to max 400px width using `sharp`
  - Convert to WebP format
  - Upload thumbnail to MinIO at `documents/{userId}/{docId}/{versionId}/thumbnail.webp`
- Update `document_versions.storageUrl` with presigned download URL (24hr expiry)

#### Stage 3: PDF_RENDERING
- For PDFs only (skip for images, mark page 1 = original image):
  - For each page in the PDF:
    - Render to PNG at 300 DPI using `pdf2pic`
    - Upload each PNG to MinIO: `documents/{userId}/{docId}/{versionId}/pages/page_{n}.png`
    - Create `document_pages` record: versionId, pageNumber, storageKey, width, height
- For images:
  - Determine image dimensions using `sharp`
  - Create 1 `document_pages` record pointing to original file

#### Stage 4: IMAGE_PREPROCESSING
- For each page image:
  - Download from MinIO (or process from buffer)
  - Use `sharp` to:
    - Auto-rotate based on EXIF orientation
    - Convert to grayscale (helps OCR on colored backgrounds)
    - Enhance contrast (normalize)
    - Sharpen slightly
  - Upload preprocessed version to MinIO: `pages/page_{n}_processed.png`
  - Or: pass preprocessed buffer to Stage 5 directly (no extra storage needed)
- Note: Full deskew requires Python/OpenCV — in Checkpoint 2, skip deskew (add in Checkpoint 3)

#### Stage 5: OCR
- For each page (use preprocessed image path):
  - Call PaddleOCR sidecar: `POST http://paddle-ocr:8081/ocr { image_path, lang: "ch" }`
  - Parse response into `OcrPageResult` format (blocks with text, bbox, confidence, language)
  - Calculate page-level confidence: average of all block confidences
  - Create `OcrResult` record in DB with:
    - `rawText`: all block texts joined with newlines
    - `blocks`: full JSON array of blocks
    - `pageConfidence`: average confidence
    - `ocrProvider`: "paddle"
    - `fallbackUsed`: false (VLM fallback added in Checkpoint 3)
- For Checkpoint 2: if PaddleOCR is unavailable, use a simple fallback that reads any embedded PDF text layer

#### Stage 6: LANGUAGE_DETECTION
- For each OCR block, detect script:
  - Count Devanagari Unicode chars (U+0900–U+097F)
  - Count Latin chars (a-z, A-Z)
  - If Devanagari ratio > 0.6: language = "hi"
  - If Latin ratio > 0.6: language = "en"
  - If both > 0.2: language = "hi+en"
- Aggregate to page level (majority vote)
- Aggregate to document level
- Update `documents.primaryLanguage` and `secondaryLanguages`

#### Stage 7: DOCUMENT_CLASSIFICATION
- Concatenate first 2000 characters of raw OCR text from all pages
- Call LLM (OpenAI gpt-4o-mini or equivalent) with classification prompt
- Parse JSON response: `{ category, confidence, reasoning, key_indicators }`
- Update `documents.category` and `documents.categoryConfidence`
- If confidence < 0.50: set category to UNKNOWN
- Log: `"Classified as {category} with confidence {confidence}"`

#### Stage 8: TEXT_NORMALIZATION
- For all OCR text:
  - Remove excessive whitespace (multiple spaces → single space)
  - Fix Unicode normalization issues (NFC form for Devanagari)
  - Remove stray non-printable characters
  - Fix common OCR artifacts: `l` vs `I` confusion, `0` vs `O` in context
- Store normalized text (can update `ocr_results.rawText` with normalized version)

#### Stage 9: STRUCTURED_EXTRACTION
- Load extraction schema based on `documents.category`
- Build LLM prompt with: schema description, OCR text, language hint
- Call LLM with `response_format: json_object`
- Parse extracted fields from LLM response
- For each field:
  - Create `document_fields` record with: fieldName, fieldType, rawValue, confidence
  - Create `document_version_fields` record (for versioning support)
- Store extraction notes in processing job metadata

#### Stage 10: CONFIDENCE_SCORING
- For each extracted field:
  - Start with LLM-reported confidence
  - Find the OCR blocks that likely contain this field's value
  - Weight: `final_confidence = (llm_confidence * 0.7) + (ocr_block_confidence * 0.3)`
  - Assign `confidenceLevel`: HIGH (>= 0.85), MEDIUM (0.65–0.84), LOW (< 0.65)
- Calculate document-level confidence: weighted average of all field confidences
- Update each `document_fields` record with final confidence

#### Stage 11: VALIDATION
- For date fields: attempt to parse with multiple formats (DD-MM-YYYY, MM/DD/YYYY, "20 August 2026", "20 अगस्त 2026")
- For currency fields: strip non-numeric chars, verify result is a number
- For GSTIN fields: validate format (15-char alphanumeric pattern)
- For date logic: if `deadline` is before `issue_date`, flag as LOW confidence
- If a REQUIRED field has confidence < 0.40: add to review queue (`isVerified = false`)
- Update field confidence downward for format validation failures

#### Stage 12: CHUNKING
- Take all normalized OCR text, organized by page
- Chunking strategy:
  - Detect headings: lines that are all-caps, or followed by ":" or are bold (inferred from font size in OCR data)
  - Split on double newlines (paragraph boundaries)
  - Target chunk size: 400–600 tokens
  - If a paragraph is too long: split at sentence boundaries
  - Never split in the middle of a sentence
  - Never split tables (keep table rows together)
- For each chunk:
  - Create `document_chunks` record with: content, pageNumber, chunkIndex, sectionTitle, tokenCount
  - Count tokens using `tiktoken` library

#### Stage 13: EMBEDDING
- For each chunk (batch them: up to 100 per API call):
  - Call embedding provider: OpenAI `text-embedding-3-small` or configured provider
  - Store `document_embeddings` record with: chunkId, embedding (vector), model, dimension
- Cache embeddings in Redis keyed by SHA-256 of content (24hr TTL) to avoid re-computing same text

#### Stage 14: INDEXING
- The `content_tsv` GIN index trigger automatically fires on chunk insert — no manual action needed
- Verify at least 1 embedding row exists for this version in `document_embeddings`
- Verify chunks are queryable via `@@ plainto_tsquery` (run a test query)
- If any embedding insert failed: retry Stage 13 before continuing

#### Stage 15: COMPLETED
- Update `documents.status = COMPLETED`
- Update `document_versions.processingStatus = COMPLETED`
- Update `document_versions.completedAt` and `processingDurationMs`
- Update `processing_jobs.status = COMPLETED`
- Enqueue notification job: `{ userId, documentId, type: "PROCESSING_COMPLETE" }`
- The notification processor logs "Document {id} processing complete for user {userId}"
  (Email sending is a future feature — for now just log it)

---

### B. Error Handling & Retries

BullMQ handles retries automatically, but the code must be idempotent:

**Retry configuration:**
```
document-processing queue:
  attempts: 3
  backoff: { type: 'exponential', delay: 5000 }
  timeout: 600000  (10 minutes per job)

Per-stage error handling:
  - On first failure: retry the entire pipeline from the failed stage
  - Stage re-entry: check which stages are already COMPLETED, skip them
  - Store: errorCode, errorMessage, retryCount per stage in stageHistory JSON
  - After 3 failures: status = FAILED, notify user
```

**Dead-letter behavior:**
- After max retries: update `documents.status = FAILED`
- Update `processing_jobs.status = FAILED`
- Log permanent failure at ERROR level
- Store full error stack in `processing_jobs.errorStack`

---

### C. Processing Status API (Enhanced)

Enhance the status endpoint to return stage-level detail:

```json
{
  "data": {
    "documentId": "doc_xyz123",
    "status": "PROCESSING",
    "currentStage": "EMBEDDING",
    "completedStages": [
      "FILE_VALIDATION",
      "FILE_STORAGE",
      "PDF_RENDERING",
      "IMAGE_PREPROCESSING",
      "OCR",
      "LANGUAGE_DETECTION",
      "DOCUMENT_CLASSIFICATION",
      "TEXT_NORMALIZATION",
      "STRUCTURED_EXTRACTION",
      "CONFIDENCE_SCORING",
      "VALIDATION",
      "CHUNKING"
    ],
    "progress": 85,
    "stageHistory": [
      {
        "stage": "OCR",
        "status": "COMPLETED",
        "startedAt": "2026-08-19T00:01:00Z",
        "completedAt": "2026-08-19T00:01:18Z",
        "durationMs": 18000
      }
    ],
    "startedAt": "2026-08-19T00:00:30Z",
    "estimatedCompletionMs": 15000
  }
}
```

---

### D. New API Endpoints (Document Data)

After processing completes, these must return real data:

```
GET /api/v1/documents/:id/pages           ← List all pages with OCR data
GET /api/v1/documents/:id/pages/:pageNum  ← Get page with full OCR blocks
GET /api/v1/documents/:id/fields          ← Get all extracted fields
GET /api/v1/documents/:id/ocr             ← Get raw OCR output for all pages
```

**`GET /documents/:id/fields`** response:
```json
{
  "data": {
    "documentId": "doc_xyz123",
    "category": "GOVERNMENT_NOTICE",
    "categoryConfidence": 0.94,
    "overallConfidence": 0.81,
    "fields": [
      {
        "id": "field_abc",
        "fieldName": "deadline",
        "fieldType": "DATE",
        "rawValue": "20 August 2026",
        "normalizedValue": "2026-08-20",
        "confidence": 0.87,
        "confidenceLevel": "HIGH",
        "sourcePage": 2,
        "isVerified": false,
        "isRejected": false
      },
      {
        "id": "field_def",
        "fieldName": "issuing_authority",
        "fieldType": "TEXT",
        "rawValue": "Bihar State Government, Education Department",
        "confidence": 0.62,
        "confidenceLevel": "LOW",
        "sourcePage": 1,
        "isVerified": false,
        "isRejected": false
      }
    ]
  }
}
```

---

### E. Frontend Processing Status UI

**Enhance the Document Detail page (`/documents/:id`):**

Show real-time processing stages with animated progress:

```
Document Processing Status

[✓] File Validated
[✓] Stored to Cloud
[✓] Pages Rendered
[✓] Image Enhanced
[⟳] OCR Running...      (animated spinner)
[ ] Language Detection
[ ] Classification
[ ] ...

Progress: ████████░░░░ 60%

Estimated time remaining: ~30 seconds
```

**Polling logic:**
- Poll `/documents/:id/status` every 2 seconds while status is not COMPLETED or FAILED
- Stop polling on COMPLETED or FAILED
- On COMPLETED: replace status view with document content view
- On FAILED: show error message with retry button

**After COMPLETED, document detail page shows:**
- Two-panel layout:
  - Left: Thumbnail image of first page
  - Right: Extracted fields with confidence badges

---

## 2.2 What the Final Output Looks Like

**Demo Flow:**
1. Upload a Hindi government notice PDF (3 pages)
2. See processing stages tick through in real-time in the browser
3. After ~60 seconds: status changes to "COMPLETED"
4. Page refreshes to show document detail:
   - Left panel: first page thumbnail
   - Right panel: extracted fields
     - `category`: Government Notice (confidence 94%) ← green badge
     - `deadline`: 20 August 2026 (confidence 87%) ← green badge
     - `issuing_authority`: Bihar State Government (confidence 62%) ← red badge (LOW)
     - `eligibility`: Class 9th or above (confidence 71%) ← yellow badge (MEDIUM)
5. API call `GET /documents/:id/fields` returns all 6 extracted fields
6. API call `GET /documents/:id/pages/2` returns OCR blocks for page 2 with bounding boxes

**Database after this demo:**
```sql
-- OCR results stored
SELECT page_number, LEFT(raw_text, 100), page_confidence
FROM ocr_results WHERE version_id = 'ver_xyz';
-- 3 rows, one per page, confidence ~ 0.88

-- Chunks created
SELECT chunk_index, page_number, token_count
FROM document_chunks WHERE version_id = 'ver_xyz';
-- 8-12 rows (chunks spanning all pages)

-- Embeddings stored
SELECT COUNT(*), model FROM document_embeddings
WHERE version_id = 'ver_xyz';
-- Same count as chunks, model = "text-embedding-3-small"

-- Fields extracted
SELECT field_name, raw_value, confidence, confidence_level
FROM document_fields WHERE document_id = 'doc_xyz';
-- 6-8 rows depending on document type
```

---

## 2.3 Acceptance Criteria

- [ ] Upload a 3-page PDF → all 15 stages complete → status = COMPLETED (within 90 seconds)
- [ ] Upload a single PNG → pipeline handles it (pages = 1) → COMPLETED
- [ ] Processing status API shows correct stage and progress throughout
- [ ] Frontend status page shows stage-by-stage progress in real-time
- [ ] OCR results stored: raw text, bounding boxes, confidence per block
- [ ] Language detected correctly: Hindi doc → primaryLanguage = "hi"
- [ ] Classification correct for test documents: Gov notice → GOVERNMENT_NOTICE
- [ ] Structured extraction produces fields for the correct schema
- [ ] Low-confidence fields (< 0.65) get confidenceLevel = "LOW"
- [ ] Chunks created (verify count > 0, token counts are > 0)
- [ ] Embeddings stored in pgvector (verify dimension = 1536)
- [ ] Full-text search index populated (run: `SELECT to_tsvector('english', content) FROM document_chunks LIMIT 1;`)
- [ ] Upload a corrupted file → status = FAILED with error code CORRUPTED_FILE
- [ ] Upload a 101-page PDF → status = FAILED with MAX_PAGES_EXCEEDED
- [ ] Failed job retries 3 times with exponential backoff, then permanently fails
- [ ] `GET /documents/:id/fields` returns fields with confidence and source page
- [ ] `GET /documents/:id/pages/1` returns OCR blocks with bounding boxes

---

---

# CHECKPOINT 3

## Intelligence, Confidence & Human Verification

**Theme:** "The system knows what it doesn't know, and humans fix what the AI gets wrong."

**Duration:** 3 weeks

---

## 3.1 What to Build

### A. VLM Fallback for Low-Confidence OCR

Implement the OCR confidence routing system.

**What to build in Stage 5 (OCR Enhancement):**
- After PaddleOCR runs, check page confidence
- If `pageConfidence < 0.70`:
  - Download page image
  - Encode as base64
  - Call LLM vision API (Gemini `gemini-1.5-flash` or GPT-4o):
    - Send image + prompt: "Extract all text from this Indian document image. Return JSON with blocks containing text, approximate position (as percentages of image width/height), and confidence."
  - Parse VLM response
  - Use VLM result as the primary OCR output
  - Set `ocrResult.fallbackUsed = true`, `ocrResult.fallbackProvider = "gemini"`
- If `pageConfidence >= 0.70` but some blocks < 0.65:
  - Crop those specific block regions using `sharp`
  - Send each crop to VLM for re-reading
  - Replace only those blocks' text with VLM output
- Update `ocr_results` with enhanced text

---

### B. Deskew & Advanced Preprocessing (Stage 4 Enhancement)

Improve image preprocessing:
- Install and use `opencv4nodejs` or call a Python sidecar for:
  - Detect rotation angle (Hough line transform)
  - Rotate image to correct angle if > 1 degree off
  - Binarize (threshold) for better OCR
- This significantly improves OCR accuracy for scanned Indian documents

---

### C. Handwriting Detection & Handling

- Detect if blocks are likely handwritten:
  - Low confidence (< 0.60) + irregular bounding box aspect ratios
  - Or: specific annotation on OCR blocks (PaddleOCR can hint at handwriting)
- For detected handwritten blocks: always route to VLM fallback
- Store in OcrResult: `containsHandwriting: true`
- Show indicator in UI: "This document contains handwritten content"

---

### D. Extraction Schema (All 10 Document Types)

Implement extraction schemas and prompts for all 10 types:
- GovernmentNotice ← already done in Checkpoint 2
- Invoice (with line items, GSTIN validation, GST calculation verification)
- Receipt (merchant, amount, items, payment method)
- Certificate (holder name, cert type, cert number, dates, authority)
- CollegeDocument (institution, student, document type, marks/grade if applicable)
- BankDocument (account, bank, period, opening/closing balance, key transactions)
- LegalDocument (parties, court, case number, date, brief subject)
- EmploymentDocument (employee, employer, designation, date, CTC)
- Form (form number, form type, key filled fields)
- Letter (sender, recipient, date, subject, summary of 2 sentences)

For each schema: write the extraction prompt in both Hindi and English variants.

---

### E. Field Validation (Enhanced)

Implement per-field type validation:

**Date validation:**
- Parse: `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `D MMMM YYYY`, `D MMM YY`
- Hindi dates: "20 अगस्त 2026" → detect month names in Hindi
- If parsed: store `normalizedValue = "2026-08-20"` alongside raw value
- If cannot parse: set confidence = 0.40 (LOW)

**Currency validation:**
- Strip: `Rs.`, `₹`, `,`, spaces
- Parse as float
- If negative: flag as anomaly (confidence -= 0.20)
- If > 10Cr (100,000,000): flag for review

**GSTIN validation:**
- Pattern: `^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$`
- If matches: confidence += 0.10
- If doesn't match: confidence = 0.30 (likely OCR misread)

**Cross-field validation:**
- Invoice: `subtotal + tax_amount` should approximately equal `total_amount` (within 5%)
- Notice: `deadline` should be after `issue_date`
- Certificate: `expiry_date` should be after `issue_date`
- If validation fails: add note to field, reduce confidence

---

### F. HITL Review System

**New API endpoints:**

```
GET  /api/v1/review                    ← Review queue: low-confidence unverified fields
GET  /api/v1/review/stats              ← Count of pending/completed reviews
POST /api/v1/review/fields/:id/accept  ← Accept field as-is
POST /api/v1/review/fields/:id/edit    ← Edit field value
POST /api/v1/review/fields/:id/reject  ← Reject field entirely
```

**Review Queue (`GET /api/v1/review`):**
- Return all `document_fields` where:
  - `confidenceLevel = 'LOW'`
  - `isVerified = false`
  - `isRejected = false`
  - `document.userId = currentUser.id`
  - `document.status = 'COMPLETED'`
- Include: document title, field name, field value, confidence, source page, bounding box
- Sort: by confidence ascending (lowest confidence first)
- Paginate: 20 per page

**Accept (`POST /review/fields/:id/accept`):**
- Verify field belongs to current user's document
- Set `document_fields.isVerified = true`
- Create `verification_events` record: action = ACCEPTED
- Log audit event: `FIELD_ACCEPTED`
- Return updated field

**Edit (`POST /review/fields/:id/edit`):**
- Body: `{ newValue: string, reason?: string }`
- Verify ownership
- Store: previousValue = current rawValue
- Update: `rawValue = newValue`, `isVerified = true`, `confidence = 1.0` (human-verified = 100%)
- Create `verification_events` record: action = EDITED, previousValue, newValue
- Log audit event: `FIELD_EDITED`
- Re-validate new value (date parsing, currency parsing)
- Return updated field

**Reject (`POST /review/fields/:id/reject`):**
- Body: `{ reason?: string }`
- Set `isRejected = true`, `isVerified = true`
- Create `verification_events` record: action = REJECTED
- Log audit event: `FIELD_REJECTED`
- Return updated field

---

### G. Document Classification Override

**Endpoint:**
```
PATCH /api/v1/documents/:id/category
Body: { category: DocumentCategory, reason?: string }
```
- Verify ownership
- Update `documents.category`
- Set `documents.categoryOverride = true`
- Create `classification_corrections` record
- Log audit event: `CLASSIFICATION_OVERRIDDEN`
- Return updated document

---

### H. Document Versioning API

```
GET  /api/v1/documents/:id/versions            ← List all versions
POST /api/v1/documents/:id/versions            ← Upload new version (returns presigned URL)
GET  /api/v1/documents/:id/versions/:vId       ← Get specific version detail
GET  /api/v1/documents/:id/versions/compare?v1=&v2=  ← Compare two versions
```

**New Version Upload:**
- Same presigned URL flow as initial upload
- Increments `versionNumber`
- The new version goes through the full 15-stage pipeline
- Previous versions remain in the database unchanged

**Version Comparison (`GET /versions/compare`):**
- Field diff: for each field name present in either version, compare values
- Mark each field: UNCHANGED, CHANGED (show old + new), ADDED (only in v2), REMOVED (only in v1)
- Text diff: page-by-page word-level diff using `diff` npm library
- Return semantic change summary (call LLM with diff data, generate 2-sentence summary)

---

### I. Frontend: HITL Verification UI

**New section on Document Detail page (`/documents/:id`):**

Right panel shows fields grouped by confidence:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEEDS VERIFICATION (2 fields)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Issuing Authority          [LOW 62%]
   "Bihar State Government"
   Source: Page 1
   [✓ Accept]  [✏ Edit]  [✗ Reject]

📅 Deadline                   [LOW 58%]
   "20 August 2026"
   Source: Page 2
   [✓ Accept]  [✏ Edit]  [✗ Reject]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFIED (4 fields)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Notice Number              [HIGH 93%]
   "EDU/2026/4521"

✅ Issue Date                 [HIGH 88%]
   "2026-07-15"
```

**Edit flow:**
- Click "✏ Edit" → inline input field appears with current value pre-filled
- User types new value
- Click "Save" → PATCH request → field updates with green checkmark animation
- Field moves to "Verified" section

**OCR overlay on left panel:**
- "Show OCR Regions" toggle button
- When enabled: colored rectangles over the document image
  - Green = HIGH confidence
  - Yellow = MEDIUM confidence
  - Red = LOW confidence
- Hover over rectangle → tooltip shows extracted text and confidence %
- Click rectangle → right panel scrolls to corresponding field

**Review queue page (`/review`):**
- Global review queue: all LOW-confidence fields across ALL documents
- Filter by document or field type
- Batch actions: accept multiple fields at once
- Progress: "15 of 38 fields reviewed"

---

### J. Document Viewer Improvements

- Full PDF viewer using `react-pdf` (not just thumbnail)
- Page navigation: "< Page 1 of 3 >"
- Zoom controls: 50% / 75% / 100% / 125% / 150%
- "Fit to width" button
- When a field is clicked in the right panel:
  - Left panel jumps to the source page
  - OCR region for that field pulses/highlights
- Download button: generates presigned URL for original file

---

## 3.2 What the Final Output Looks Like

**Demo Flow:**
1. Upload a blurry, slightly rotated Hindi government notice scan
2. Pipeline runs:
   - Preprocessing: image is deskewed and contrast-enhanced
   - OCR: page confidence 0.61 → VLM fallback triggered
   - VLM reads the text: confidence now 0.84
3. Document completes processing
4. Right panel shows 3 fields:
   - `deadline`: LOW 58% → shows in "Needs Verification" with red badge
   - `notice_number`: HIGH 91% → auto-accepted, shows in "Verified"
   - `issuing_authority`: MEDIUM 72% → yellow badge
5. Click "✏ Edit" on deadline → type "2026-08-20" → click Save → field verified
6. Click "✗ Reject" on a wrongly extracted field → field disappears from fields list
7. Upload a second version of same notice → new version created → runs full pipeline
8. View comparison: deadline changed from "August 10" to "August 20" → shown in red/green diff

---

## 3.3 Acceptance Criteria

- [ ] PaddleOCR running → low-confidence page → VLM fallback triggers → `fallbackUsed = true` in DB
- [ ] Handwritten text in document → `containsHandwriting = true` in OCR result
- [ ] Date fields normalized: "20 August 2026" → stored as "2026-08-20" in `normalizedValue`
- [ ] GSTIN extracted: valid GSTIN has confidence boost, invalid GSTIN has confidence 0.30
- [ ] Cross-field validation: `subtotal + tax != total` → invoice field confidence reduced
- [ ] `GET /review` returns only LOW-confidence unverified fields for the current user
- [ ] Accept action: `isVerified = true`, verification_event created, audit_log created
- [ ] Edit action: rawValue updated, confidence = 1.0, verification_event with oldValue/newValue
- [ ] Reject action: `isRejected = true`, field removed from review queue
- [ ] Classification override endpoint works, `categoryOverride = true` in DB
- [ ] New version upload → triggers full pipeline → separate DB records from v1
- [ ] Version comparison returns field diffs (CHANGED/ADDED/REMOVED/UNCHANGED)
- [ ] OCR overlay renders correct color-coded bounding boxes on document images
- [ ] Clicking a field in right panel → left panel jumps to correct page
- [ ] Edit flow: inline editor appears, save works, optimistic update in UI
- [ ] Review queue page shows all LOW-confidence fields across documents

---

---

# CHECKPOINT 4

## Search, RAG & Conversational AI

**Theme:** "Users stop reading documents. They start talking to them."

**Duration:** 4 weeks

---

## 4.1 What to Build

### A. Hybrid Search Service

**What to implement:**

```
GET /api/v1/search?q={query}&mode={hybrid|semantic|keyword}&category=&lang=&page=&limit=
POST /api/v1/search/semantic    ← Body: { query, filters }
POST /api/v1/search/keyword     ← Body: { query, filters }
```

**Hybrid search flow:**
1. Detect query language (Hindi/English/Hinglish)
2. Generate query embedding using EmbeddingProvider
3. Run semantic search (pgvector):
   ```sql
   SELECT ..., 1 - (embedding <=> {queryVector}::vector) AS semantic_score
   FROM document_embeddings de
   JOIN document_chunks dc ON de.chunk_id = dc.id
   JOIN documents d ON ... WHERE d.user_id = {userId}
   ORDER BY semantic_score DESC LIMIT 20
   ```
4. Run keyword search (PostgreSQL FTS + pg_trgm):
   ```sql
   SELECT ..., ts_rank(content_tsv, plainto_tsquery('english', {query})) AS keyword_score
   FROM document_chunks dc
   JOIN documents d ON ... WHERE content_tsv @@ plainto_tsquery('english', {query})
   OR content ILIKE '%{query}%'  -- pg_trgm fallback for Hindi
   ```
5. Merge results:
   - Normalize scores to [0, 1] range (min-max normalization per result set)
   - `final_score = (semantic_score * 0.6) + (keyword_score * 0.4)`
   - Deduplicate by chunk_id (keep higher score)
   - Sort by final_score descending
6. Extract highlighted snippets: find query terms in chunk content, return 200-char window around them
7. Return top 10 results

**Search Result:**
```json
{
  "data": {
    "query": "scholarship deadline Bihar",
    "mode": "hybrid",
    "results": [
      {
        "chunkId": "...",
        "documentId": "...",
        "documentTitle": "Bihar Scholarship Notice 2026",
        "documentCategory": "GOVERNMENT_NOTICE",
        "pageNumber": 2,
        "sectionTitle": "Important Dates",
        "snippet": "...application deadline is **20 August 2026** for all eligible...",
        "semanticScore": 0.91,
        "keywordScore": 0.78,
        "finalScore": 0.86
      }
    ],
    "totalResults": 3,
    "searchDurationMs": 145
  }
}
```

**Search filters:**
- `category` — filter by document category
- `lang` — filter by document language
- `uploadedAfter` / `uploadedBefore` — date range
- `documentId` — restrict to one document

---

### B. Conversations Module

**Endpoints:**
```
GET    /api/v1/conversations                    ← List user's conversations
POST   /api/v1/conversations                    ← Create new conversation
GET    /api/v1/conversations/:id                ← Get conversation with messages
DELETE /api/v1/conversations/:id                ← Delete conversation
POST   /api/v1/conversations/:id/messages       ← Send message, stream response
GET    /api/v1/conversations/:id/messages       ← Get message history (paginated)
```

**Create Conversation:**
- Body: `{ documentId?, title?, language? }`
- If `documentId` provided: conversation scoped to one document
- If no `documentId`: conversation spans all user documents (global)
- Store conversation in DB
- Return: `{ conversationId, title, createdAt }`

**Send Message & Stream Response (`POST /conversations/:id/messages`):**
- Body: `{ content: string }`
- Verify conversation belongs to current user
- Detect query language
- Save user message to DB
- Run RAG pipeline:
  1. Generate query embedding
  2. Hybrid search (scoped to documentId if set, else all user docs)
  3. Retrieve top 10 chunks
  4. Build context (fit within 8000 tokens)
  5. Build prompt with system message + conversation history (last 10 turns) + context + user query
  6. Call LLM with stream: true
- Stream response back via Server-Sent Events (SSE):
  - Content-Type: `text/event-stream`
  - Each token: `data: {"type":"token","content":"..."}\n\n`
  - On completion: `data: {"type":"done","citations":[...]}\n\n`
- After stream ends: save assistant message + citations to DB

---

### C. RAG Pipeline (Full Implementation)

**QueryPreprocessor service:**
- Detect language (Devanagari script detection + langdetect library)
- Clean query: remove filler words, normalize whitespace
- For Hindi queries: transliterate Hinglish to Hindi if needed
- Detect query intent: FACTUAL (needs search), STRUCTURED (needs DB query), SUMMARIZATION

**HybridRetriever service:**
- If intent = FACTUAL: run hybrid search as described above
- If intent = STRUCTURED (detected keywords like "deadline", "total", "how many"):
  - Use `get_extracted_fields` or `get_deadlines` tool (SQL query)
  - Combine with semantic search results
- If intent = SUMMARIZATION: get first N chunks of document (no search)

**ContextBuilder service:**
- Receive ranked chunks
- Remove duplicate content (same text from different chunks)
- Count tokens: keep adding chunks until budget (8000 tokens) reached
- Format context for LLM:
  ```
  [Source 1: Bihar Scholarship Notice, Page 2, Section: Important Dates]
  आवेदन की अंतिम तिथि 20 अगस्त 2026 निर्धारित की गई है।

  [Source 2: Bihar Scholarship Notice, Page 1, Section: Eligibility]
  कक्षा 9वीं से 12वीं तक के विद्यार्थी आवेदन कर सकते हैं।
  ```

**RAG System Prompt:**
```
You are DocSaarthi, an intelligent document assistant.
{language_instruction}

CRITICAL RULES:
1. ONLY answer based on the context provided. Never use external knowledge.
2. If information is not in the context, say: "I could not find this in your documents."
3. Cite every fact: [Source: Document Title, Page X, Section Y]
4. Respond in the SAME LANGUAGE as the user's question.
5. Be concise. Do not repeat the question.
```

**CitationExtractor service:**
- After LLM response is complete: parse for `[Source: ...]` patterns
- Match each citation to a chunk from the retrieved set
- Create `citations` records in DB: messageId, chunkId, documentId, pageNumber, sectionTitle
- Return citations array with complete metadata

**Grounding enforcer:**
- If no chunks were retrieved AND the response contains factual claims → flag as suspicious
- Log warning, optionally replace with safe refusal message

---

### D. Tool-Calling Agent (DocumentAgent)

Implement the full agent with all 11 tools:

**Register tools on LLM call:**
```typescript
tools: [
  search_documents,    // Hybrid search
  search_semantic,     // Pure vector search
  get_document,        // Full document info
  get_document_page,   // Specific page content
  get_extracted_fields, // Structured fields only
  get_document_metadata, // Lightweight metadata
  compare_documents,   // Version comparison
  list_user_documents, // List with filters
  get_documents_by_category, // Category filter
  get_deadlines,       // Direct SQL deadline query
  summarize_document,  // LLM summary generation
]
```

**Agent loop:**
1. Receive user query + conversation history
2. Call LLM with tools and system prompt
3. If LLM calls a tool: execute tool, append result to messages
4. If LLM calls multiple tools: execute in sequence (or parallel if independent)
5. If LLM produces final answer: stream it to user
6. Max 5 tool calls per turn
7. If 5 tool calls used and no answer: force final answer from gathered context

**Example tool-calling flow:**
```
User: "Show me all government notices with deadlines this month"

LLM thinks: I need to query deadlines for government notices
LLM calls: get_deadlines({ document_category: "GOVERNMENT_NOTICE", upcoming_days: 30 })

Tool returns: [
  { document_title: "Bihar Scholarship", deadline: "2026-08-20", document_id: "..." },
  { document_title: "UP Scheme Notice", deadline: "2026-08-28", document_id: "..." }
]

LLM produces answer:
"You have 2 government notices with deadlines this month:
1. Bihar Scholarship Notice — deadline: 20 August 2026 [Source: ...]
2. UP Scheme Notice — deadline: 28 August 2026 [Source: ...]"
```

---

### E. Multilingual Chat Support

**Language detection in conversation:**
- Detect language of each user message
- Store `messages.language` in DB
- Select system prompt variant based on detected language
- For Hinglish: use English system prompt with Hindi language instruction

**Hindi response quality:**
- When responding in Hindi, ensure LLM outputs proper Devanagari
- System prompt in Hindi for Hindi queries: "उत्तर हमेशा हिंदी में दें।"
- Numbers and dates in Hindi context: use Hindi numerals or Arabic numerals (both acceptable)

**Test queries to validate multilingual support:**
- Hindi: "इस नोटिस की अंतिम तारीख क्या है?" → Answer in Hindi
- English: "What is the deadline?" → Answer in English
- Hinglish: "Is notice ki last date kya hai?" → Answer in natural Hinglish or Hindi
- Cross-language: "Is scholarship ke liye kya kya documents chahiye?" → Answer in Hindi

---

### F. Frontend: Chat Interface

**New page: `/documents/:id/chat`**

Layout:
```
┌─────────────────────────────────────────────────────────┐
│ Chat with: Bihar Scholarship Notice 2026      [← Back]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                     💬 Messages                          │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │ You: इस नोटिस की अंतिम तारीख क्या है?       │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ DocSaarthi:                                      │   │
│  │ अंतिम तारीख 20 अगस्त 2026 है।                   │   │
│  │                                                  │   │
│  │ 📄 Sources:                                      │   │
│  │ • Bihar Scholarship Notice, Page 2, "Dates"      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Ask a question in Hindi or English...          [Send] │
└─────────────────────────────────────────────────────────┘
```

**Features to implement:**
- Message list with role-based styling (user = right, assistant = left)
- Real-time token streaming: text appears word by word as LLM generates
- Loading indicator: "DocSaarthi is thinking..." with animated dots
- Citations panel below assistant message
  - Each citation: "[1] Document Title — Page X, Section Y"
  - Click citation → opens document viewer at that page (in new tab or side panel)
- Language indicator badge: "Responding in Hindi 🇮🇳"
- Suggested questions (shown on empty conversation):
  - "What is this document about?"
  - "What are the key dates?"
  - "What documents do I need to submit?"
- Conversation history sidebar (list of past conversations for this document)
- New conversation button

**Global chat page: `/conversations`**
- List all conversations across all documents
- Filter by document
- Recent activity sorted by `updatedAt`

---

### G. Search Page

**New page: `/search`**

Layout:
```
┌─────────────────────────────────────────────────────────┐
│  🔍 Search Documents                                     │
│  [scholarship Bihar deadline          ] [Search]        │
│  Mode: ● Hybrid  ○ Semantic  ○ Keyword                  │
├────────────────┬────────────────────────────────────────┤
│ Filters        │ Results (3 found in 145ms)             │
│                │                                        │
│ Category       │ 📄 Bihar Scholarship Notice 2026       │
│ ○ All          │    Page 2 · Government Notice           │
│ ○ Gov. Notice  │    "...deadline is **20 August 2026**..." │
│ ○ Invoice      │    Score: 0.86 · Semantic: 0.91        │
│                │                                        │
│ Language       │ 📄 UP Scheme Notice                    │
│ ○ All          │    Page 1 · Government Notice           │
│ ○ Hindi        │    "...application closes August..."   │
│ ○ English      │    Score: 0.71 · Semantic: 0.69        │
│                │                                        │
│ Date Range     │                                        │
│ [Aug 1, 2026 ] │                                        │
│ [Aug 31, 2026] │                                        │
└────────────────┴────────────────────────────────────────┘
```

**Search features:**
- Real-time search (debounced 300ms)
- Mode toggle: Hybrid / Semantic / Keyword
- Filter sidebar (category, language, date range)
- Result cards with highlighted snippets (matched terms bolded)
- Click result → navigate to document at specific page
- "No results" state with suggestions
- Search history (recent queries shown when search bar is focused)

---

## 4.2 What the Final Output Looks Like

**Demo Flow 1 — Hindi Chat:**
1. Open `/documents/doc_xyz/chat`
2. Type: "इस नोटिस की अंतिम तारीख क्या है?"
3. See "DocSaarthi is thinking..." animation
4. Response streams in: "अंतिम तारीख **20 अगस्त 2026** है।"
5. Below response: "Sources: Bihar Scholarship Notice, Page 2, Section: Important Dates"
6. Click source → document viewer opens at page 2

**Demo Flow 2 — Tool-Calling for Structured Query:**
1. Open global chat (no document selected)
2. Type: "Show me all my invoices uploaded this month"
3. Agent calls: `list_user_documents({ category: "INVOICE", uploadedAfter: "2026-08-01" })`
4. Response: "You have 3 invoices uploaded this month: [list with amounts and dates]"

**Demo Flow 3 — Hinglish:**
1. Type: "Is form ki last date kya hai aur kya kya documents chahiye?"
2. System detects Hinglish
3. Response in Hindi: "इस फ़ॉर्म की अंतिम तारीख 20 अगस्त है। आवश्यक दस्तावेज़: ..."

**Demo Flow 4 — Hybrid Search:**
1. Open `/search`
2. Type: "Aadhaar deadline extension"
3. Results show 2 documents containing both "Aadhaar" and "deadline" content
4. Click result → document opens at matched page

---

## 4.3 Acceptance Criteria

- [ ] Hybrid search returns results in < 300ms (measured with 1000 documents in DB)
- [ ] Semantic search returns results for Hindi query ("अंतिम तारीख") relevant to deadline content
- [ ] Keyword search uses pg_trgm for Hindi and tsvector for English
- [ ] Search filters work: category, language, date range
- [ ] Conversation creation works (with and without documentId)
- [ ] Chat message saves to DB, LLM response streams token by token
- [ ] SSE streaming works in browser (no buffering, real-time appearance)
- [ ] Citations are stored in DB after response completes
- [ ] Click citation → document viewer opens at correct page
- [ ] Multi-turn conversation: asking follow-up question uses conversation history
- [ ] Hindi query → response in Hindi
- [ ] English query → response in English
- [ ] Hinglish query → response in Hindi or natural Hinglish
- [ ] Agent tool-calling works: "list all invoices" → agent calls `list_user_documents`
- [ ] `get_deadlines` tool queries SQL directly (no vector search)
- [ ] Hallucination guard: question about content not in any document → system says "not found"
- [ ] Max 5 tool calls per turn enforced
- [ ] Search page loads, search works, results have highlighted snippets
- [ ] Chat page streams responses correctly
- [ ] Conversation history shows past messages on reload

---

---

# CHECKPOINT 5

## Security, Performance & Production Readiness

**Theme:** "What works for 1 user must work for 1,000. What works in dev must work in production."

**Duration:** 4 weeks

---

## 5.1 What to Build

### A. Complete Rate Limiting

Implement Redis sliding window rate limiting for ALL endpoints:

| Endpoint | Limit | Window |
|---|---|---|
| `POST /auth/register` | 5 per IP | 1 hour |
| `POST /auth/login` | 5 per IP | 15 minutes |
| `POST /auth/forgot-password` | 3 per IP+email | 1 hour |
| `POST /documents` (upload) | 10 per user | 1 minute |
| `POST /conversations/:id/messages` (chat) | 30 per user | 1 minute |
| `GET /search` | 60 per user | 1 minute |
| `POST /review/fields/:id/*` | 100 per user | 1 minute |
| `GET /api/v1/*` (general) | 100 per user | 1 minute |

**Implementation:**
- Redis INCR + EXPIRE for sliding window
- Return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on all responses
- On limit exceeded: 429 Too Many Requests with `Retry-After` header
- IP extraction: trust `X-Forwarded-For` only if behind known proxy

---

### B. Comprehensive Caching Layer

**Cache all expensive read operations:**

```typescript
// User profile — cache 5 minutes
await cache.getOrSet(`user:${userId}:profile`, () => db.user.findUnique(...), 300);

// Document fields — cache 10 minutes (invalidated on HITL update)
await cache.getOrSet(`doc:${documentId}:fields`, () => db.documentField.findMany(...), 600);

// Document processing status — cache 30 seconds (short TTL for polling)
await cache.getOrSet(`doc:${documentId}:status`, () => db.document.findUnique(...), 30);

// Search results — cache 5 minutes per user+query hash
const queryHash = sha256(`${userId}:${query}:${JSON.stringify(filters)}`);
await cache.getOrSet(`search:${queryHash}`, () => hybridSearch(...), 300);

// Embeddings — cache 24 hours per text hash (same text = same embedding)
const textHash = sha256(text);
await cache.getOrSet(`embed:${textHash}`, () => embeddingProvider.embed(text), 86400);

// Dashboard stats — cache 2 minutes
await cache.getOrSet(`dashboard:${userId}:stats`, () => computeStats(userId), 120);
```

**Cache invalidation:**
- On HITL field update → invalidate `doc:{documentId}:fields`
- On classification override → invalidate document cache
- On new version upload → invalidate all document caches for that documentId
- On document delete → invalidate all caches for that documentId
- Pattern invalidation: `redis.keys('doc:${documentId}:*').then(keys => redis.del(...keys))`

---

### C. Audit Logging (Complete Implementation)

**Every meaningful action must create an audit log entry.**

**Audit events to log:**

Auth events:
- `AUTH_REGISTER` — new user created
- `AUTH_LOGIN_SUCCESS` — successful login
- `AUTH_LOGIN_FAILED` — wrong password (store IP, do not store the wrong password)
- `AUTH_LOGOUT` — user logged out
- `AUTH_TOKEN_REFRESH` — access token refreshed
- `AUTH_PASSWORD_RESET_REQUESTED`
- `AUTH_PASSWORD_RESET_COMPLETED`

Document events:
- `DOCUMENT_UPLOAD_INITIATED` — presigned URL requested
- `DOCUMENT_UPLOAD_CONFIRMED` — file confirmed in storage
- `DOCUMENT_PROCESSING_STARTED`
- `DOCUMENT_PROCESSING_COMPLETED`
- `DOCUMENT_PROCESSING_FAILED`
- `DOCUMENT_DELETED`
- `DOCUMENT_CATEGORY_OVERRIDDEN` — with old + new category

HITL events:
- `FIELD_ACCEPTED` — field confirmed by user
- `FIELD_EDITED` — field value changed (old + new value)
- `FIELD_REJECTED` — field rejected by user

Conversation events:
- `CONVERSATION_CREATED`
- `CONVERSATION_MESSAGE_SENT` — store query only (not response, to save space)
- `CONVERSATION_DELETED`

Settings events:
- `PROFILE_UPDATED`
- `PASSWORD_CHANGED`
- `API_KEY_CREATED`
- `API_KEY_REVOKED`

**`GET /api/v1/audit-logs` endpoint (authenticated, own logs only):**
- Returns user's own audit events (not other users')
- Filters: `eventType`, `resourceType`, `dateFrom`, `dateTo`
- Paginated: 50 per page
- Admins: can view all logs

---

### D. API Key Authentication

Enable B2B programmatic access:

**Endpoints:**
```
GET    /api/v1/settings/api-keys           ← List user's API keys
POST   /api/v1/settings/api-keys           ← Create new API key
DELETE /api/v1/settings/api-keys/:id       ← Revoke API key
```

**API key format:** `dsk_live_{32 random bytes as hex}` (prefix identifies environment)
- Store: SHA-256 hash of the key in DB, NOT the key itself
- Return: full key ONLY at creation time (never again)
- `keyPrefix`: first 8 chars (`dsk_live_`) for identification

**Authentication:**
- `ApiKeyAuthGuard`: check `Authorization: Bearer dsk_live_...` header
- Hash the provided key, look up in DB, verify active + not expired
- Attach user to request same as JWT auth
- Log API key usage: `lastUsedAt` update

**Rate limiting for API keys:**
- Same limits as authenticated users, keyed by API key ID not user ID

---

### E. Observability Stack

**Structured Logging (complete):**
- All logs in JSON format with Winston
- Every log entry contains: `level`, `timestamp`, `requestId`, `userId`, `service`, `module`
- Log levels: `debug` (dev only), `info` (processing events), `warn` (recoverable errors), `error` (failures)
- Never log: passwords, access tokens, document content (sensitive), PII

**Request Tracing:**
- `AsyncLocalStorage` stores `requestId` across async calls
- All service methods automatically include `requestId` in logs
- `X-Request-Id` response header
- Worker jobs include `jobId` as correlation ID

**Performance Metrics (log-based, no external APM required for Checkpoint 5):**
Log these metrics as structured events:
```json
{ "metric": "document.processing.duration", "documentId": "...", "durationMs": 45000, "pages": 3 }
{ "metric": "ocr.page.confidence", "provider": "paddle", "confidence": 0.88, "fallbackUsed": false }
{ "metric": "llm.call.duration", "provider": "openai", "model": "gpt-4o-mini", "durationMs": 1200, "tokens": 890 }
{ "metric": "search.hybrid.duration", "mode": "hybrid", "durationMs": 145, "results": 10 }
{ "metric": "chat.response.duration", "conversationId": "...", "durationMs": 3200, "toolCalls": 2 }
{ "metric": "embedding.batch.duration", "chunkCount": 12, "durationMs": 800, "cached": 3 }
```

**Health Check (enhanced):**
```
GET /api/health

Response:
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600,
  "services": {
    "database": { "status": "ok", "responseMs": 2 },
    "redis": { "status": "ok", "responseMs": 1 },
    "storage": { "status": "ok", "responseMs": 15 },
    "ocrSidecar": { "status": "ok", "responseMs": 50 },
    "llmProvider": { "status": "ok", "provider": "openai" }
  },
  "queues": {
    "document-processing": { "waiting": 0, "active": 2, "failed": 0 }
  }
}
```

**Error tracking:**
- Create `ErrorTrackingService` abstraction
- In development: log to console
- In production: send to Sentry (or configured error tracking DSN from env)
- Unhandled exceptions in worker: caught, logged, sent to error tracker

---

### F. Security Hardening

**Complete security checklist:**

1. **Input validation — all endpoints have Zod/class-validator DTOs**
   - No endpoint accepts raw `any` type
   - All string inputs have maxLength constraints
   - Enum values validated server-side

2. **File upload security**
   - Magic bytes validation (already in Checkpoint 1, verify it's complete)
   - File name sanitization: only alphanumeric, dots, hyphens — no path traversal (`../`)
   - Storage key never contains user-provided input directly (always slugified + UUID)
   - Presigned URL conditions enforce: content-type, content-length-range (no file too large)
   - ClamAV scan: optional feature flag for virus scanning on upload

3. **HTTP Security Headers (verify all are set via Helmet):**
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Content-Security-Policy: default-src 'self'`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

4. **Cookie security (verify):**
   - `HttpOnly: true`
   - `Secure: true` (production only — disable for localhost)
   - `SameSite: Strict`
   - `refresh_token` cookie Path: `/api/v1/auth/refresh`

5. **SQL injection prevention:**
   - All queries through Prisma parameterized queries
   - `$queryRaw` calls use `Prisma.sql` tagged template (prevents injection)
   - No raw string concatenation in SQL

6. **Account lockout:**
   - After 5 failed login attempts in 15 minutes: lock account for 30 minutes
   - Store lock in Redis: `auth:lockout:{userId}` with TTL
   - Return generic error message (don't reveal lockout reason to attacker)

7. **Prompt injection protection:**
   - Sanitize user chat queries before sending to LLM
   - Strip known injection patterns: "ignore previous instructions", "system:", etc.
   - Limit query length: 2000 chars max

8. **CORS:**
   - Allow only configured frontend origin
   - In production: allow only `https://docsaarthi.com` (configurable via env)

---

### G. Production Docker Configuration

**Create `infra/docker-compose.prod.yml`:**

Key differences from dev:
- No volume mounts of source code (images are built artifacts)
- Production-grade Redis config (AOF persistence, maxmemory policy)
- PostgreSQL with replication-ready config
- SSL/TLS termination via nginx or Caddy
- Resource limits on all containers
- Logging to stdout only (for Docker log collection)
- Restart policies: `restart: unless-stopped`

**Dockerfiles (all apps):**
- Multi-stage builds: build stage + slim production stage
- `apps/api/Dockerfile`: Build → `node:20-alpine`, copy only dist + node_modules (pruned)
- `apps/worker/Dockerfile`: Same pattern as API
- `apps/web/Dockerfile`: Build → standalone Next.js output → `node:20-alpine`
- `.dockerignore`: exclude src, tests, docs, local node_modules

**Environment-based config:**
- All secrets from environment variables (never hardcoded)
- `.env.example` documents every variable with type and example value
- Validate all required env vars at startup: if missing → fail fast with clear error message

---

### H. CI/CD Pipeline (Complete)

**`.github/workflows/ci.yml`:**
```
On: push to any branch, PR to main

Jobs:
  1. lint — ESLint on all packages (fail fast on errors)
  2. type-check — tsc --noEmit on all packages
  3. unit-tests — Jest unit tests with code coverage
     - Coverage threshold: > 70% for services
     - Test PostgreSQL and Redis via Docker services in CI
  4. integration-tests — API integration tests with real DB
  5. build — turbo run build (fail if build breaks)
  6. docker-build — build all Docker images (verify they build)
```

**`.github/workflows/cd.yml`:**
```
On: push to main branch

Jobs:
  1. run-ci (reuse CI workflow)
  2. build-and-push — build Docker images, push to registry (GHCR or DockerHub)
  3. deploy-staging — SSH to staging server, pull images, docker compose up
  4. smoke-test — call /api/health, expect 200
  5. notify — Slack/Discord notification on success/failure
```

---

### I. Dashboard Enhancements

**Complete the dashboard with real data:**

**Stats cards (real data, not placeholder):**
- Total Documents: `SELECT COUNT(*) FROM documents WHERE user_id = ?`
- Processing Now: `SELECT COUNT(*) WHERE status = 'PROCESSING'`
- Completed: `SELECT COUNT(*) WHERE status = 'COMPLETED'`
- Needs Review: `SELECT COUNT(*) FROM document_fields WHERE confidence_level = 'LOW' AND is_verified = false AND ...`
- Failed: `SELECT COUNT(*) WHERE status = 'FAILED'`

**Charts:**
- Documents by category: pie chart with recharts
- Upload activity: bar chart (docs uploaded per day, last 7 days)

**Upcoming deadlines widget:**
- Query `get_deadlines` equivalent: deadline fields within next 30 days
- Show as list: "Bihar Scholarship — 20 Aug 2026 (1 day left)" with color coding

**Recent activity feed:**
- Last 10 audit log entries for the user
- "Uploaded Bihar Notice", "Verified deadline field", "Asked about eligibility"

**Storage usage:**
- Sum of all document file sizes for user
- Progress bar: "12.4 MB of 50 MB used (Free tier)"

---

### J. Settings Page

**`/settings` with sub-pages:**

**`/settings/profile`:**
- Edit name, preferred language (Hindi/English toggle)
- Change password form (requires current password)
- Account deletion button (with confirmation dialog + email verification)

**`/settings/api-keys`:**
- List active API keys (name, prefix, created date, last used)
- "Create API Key" button:
  - Enter key name → Submit → Show full key ONCE with copy button → "Save this key, it won't be shown again"
- Revoke button per key

**`/settings/organization`:**
- Create or view organization
- Member management (invite by email, change role, remove)
- Organization plan display

---

## 5.2 What the Final Output Looks Like

**Demo Flow 1 — Rate Limiting:**
1. POST /auth/login with wrong password 5 times in 15 minutes
2. 6th attempt returns 429 with `Retry-After: 900` header
3. Wait 15 minutes → login works again

**Demo Flow 2 — API Key Access:**
1. Go to `/settings/api-keys`
2. Create key named "Tally Integration"
3. Copy the key: `dsk_live_abc123...`
4. Make API request: `GET /api/v1/documents` with `Authorization: Bearer dsk_live_abc123...`
5. Returns document list (authenticated as the user who created the key)

**Demo Flow 3 — Audit Log:**
1. Go to `/settings` → Audit Log section
2. See: "Uploaded Bihar Notice", "Accepted field deadline", "Asked question in chat"
3. Each entry has: timestamp, event type, resource, IP address

**Demo Flow 4 — Dashboard with Real Data:**
1. Open `/dashboard`
2. See: 12 total documents, 2 processing, 8 completed, 5 need review, 1 failed
3. Pie chart shows: 4 Government Notices, 3 Invoices, 2 Certificates, 3 Other
4. Upcoming deadlines: "Bihar Scholarship — 20 Aug 2026 (1 day!)" in red

**Demo Flow 5 — Production Docker:**
1. Run: `docker compose -f infra/docker-compose.prod.yml up -d`
2. All services start with proper resource limits
3. `curl http://localhost/api/health` returns `{ status: "ok" }`
4. Application fully functional (same as dev, but production config)

---

## 5.3 Acceptance Criteria

- [ ] Rate limiting: 6th failed login in 15 min → 429 with Retry-After header
- [ ] Rate limiting: 11th upload in 1 min → 429 for that user, other users unaffected
- [ ] Cache hit/miss logged: same search query second time returns cached result
- [ ] Cache invalidation: edit a field → next fetch of fields bypasses cache (fresh data)
- [ ] Audit log created for: login, upload, field edit, chat message, logout
- [ ] `GET /audit-logs` returns own events only (cannot see other user's events)
- [ ] API key creation returns key once, subsequent GET shows only prefix
- [ ] API key authentication works: `Bearer dsk_live_...` auth header accepted
- [ ] API key revocation: revoked key → 401 immediately
- [ ] All HTTP security headers present (check with `curl -I http://localhost:3001/api/health`)
- [ ] Upload file with wrong extension (PDF renamed to .jpg) → rejected by magic byte check
- [ ] Prompt injection attempt: "ignore previous instructions..." → sanitized/flagged in logs
- [ ] `GET /api/health` returns status of all 5 services (DB, Redis, MinIO, OCR, LLM)
- [ ] Dashboard shows correct counts from real DB queries
- [ ] Upcoming deadlines widget shows real extracted deadline fields
- [ ] All CI jobs pass on a clean branch (lint, type-check, unit tests, integration tests, build)
- [ ] Docker images build successfully: `docker build -t docsaarthi-api apps/api/`
- [ ] `docker compose -f infra/docker-compose.prod.yml up` → application works end-to-end
- [ ] Startup fails fast with clear error if required env vars are missing (e.g., no API key set)
- [ ] Settings page: profile edit, password change, API key management all work
- [ ] Account deletion initiates data purge process (or at minimum soft-deletes all records)

---

## Final Checkpoint Completion: The Complete System

When all 5 checkpoints are done, a user can:

1. **Register and log in** securely with JWT + refresh token cookies
2. **Upload any Indian document** (PDF, image) — government notice, invoice, certificate, etc.
3. **Watch real-time processing** as the 15-stage pipeline runs
4. **See extracted structured fields** with confidence scores (HIGH/MEDIUM/LOW)
5. **Verify low-confidence fields** using the HITL review interface
6. **Chat with documents in Hindi, English, or Hinglish** with cited answers
7. **Search across all documents** using hybrid semantic + keyword search
8. **Compare document versions** to see what changed
9. **Ask the agent complex queries** like "list all my deadlines this month" (SQL) or "find sections mentioning Aadhaar" (vector search)
10. **Use API keys** for programmatic access (B2B integration)
11. **Review their audit trail** to see every action taken
12. **Deploy to production** using the Docker Compose production config

---

*Checkpoint Document — DocSaarthi v1.0.0*
*Build these 5 checkpoints in sequence. Do not skip ahead.*
*Last updated: August 2026*
