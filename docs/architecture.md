# DocSaarthi — Architecture Document

> **Version:** 1.0.0
> **Date:** August 2026
> **Status:** Final Design — Engineering Review

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Application Architecture](#3-application-architecture)
4. [Database Design](#4-database-design)
5. [API Design](#5-api-design)
6. [Processing Pipeline Architecture](#6-processing-pipeline-architecture)
7. [OCR Architecture](#7-ocr-architecture)
8. [AI & LLM Architecture](#8-ai--llm-architecture)
9. [Embedding & Vector Search Architecture](#9-embedding--vector-search-architecture)
10. [RAG Architecture](#10-rag-architecture)
11. [Queue & Worker Architecture](#11-queue--worker-architecture)
12. [Authentication & Authorization Architecture](#12-authentication--authorization-architecture)
13. [Object Storage Architecture](#13-object-storage-architecture)
14. [Search Architecture](#14-search-architecture)
15. [Caching Architecture](#15-caching-architecture)
16. [Observability Architecture](#16-observability-architecture)
17. [Frontend Architecture](#17-frontend-architecture)
18. [Infrastructure & DevOps](#18-infrastructure--devops)
19. [Security Architecture](#19-security-architecture)
20. [Data Flow Diagrams](#20-data-flow-diagrams)

---

## 1. System Overview

DocSaarthi is a production-grade, event-driven, modular monorepo application built around asynchronous document processing, vector search, and multilingual conversational AI.

### High-Level System Architecture

```
+-------------------------+     +----------------------------+
|    Browser (Next.js)    |     |   Mobile (Future)          |
+----------+--------------+     +-------------+--------------+
           |                                  |
           v                                  v
+----------+---------------------------------+--------+
|              API Gateway / NestJS (Node.js)         |
|         Auth, Rate Limiting, Routing, Logging       |
+----+-------+--------+----------+----------+---------+
     |       |        |          |          |
     v       v        v          v          v
+----+  +----+  +----+    +-----+   +------+
| PG |  |Redis| |MinIO|   | BullMQ| |pgvec |
+----+  +----+  +----+    +-----+   +------+
                               |
                    +----------v-----------+
                    |    Worker Process     |
                    |  (NestJS Worker App)  |
                    +----------+-----------+
                               |
              +----------------+------------------+
              |                |                  |
              v                v                  v
        +----------+    +----------+    +------------------+
        | OCR Layer|    | LLM Layer|    | Embedding Layer  |
        | PaddleOCR|    | OpenAI / |    | OpenAI / Local   |
        | VLM fall-|    | Gemini / |    | multilingual     |
        | back     |    | Anthropic|    | model            |
        +----------+    +----------+    +------------------+
```

### Core Design Principles

1. **Async-First:** No expensive operation (OCR, LLM, embedding) blocks an HTTP request
2. **Provider-Abstracted:** OCR, LLM, Embedding providers are behind interfaces — swappable
3. **Idempotent Workers:** Every job can be retried safely without side effects
4. **Multilingual Native:** Hindi and English are equals at every layer
5. **Audit-First:** Every meaningful state change is logged immutably
6. **Security-by-Default:** Least privilege, encryption everywhere, no implicit trust
7. **Observable:** Every request, job, and AI call carries a trace ID and timing metrics

---

## 2. Monorepo Structure

```
docsaarthi/
|
+-- apps/
|   +-- web/                         # Next.js 15 frontend
|   |   +-- app/                     # App Router pages
|   |   +-- components/              # Shared UI components
|   |   +-- lib/                     # Client utilities
|   |   +-- hooks/                   # Custom React hooks
|   |   +-- store/                   # Client state (Zustand/Context)
|   |   +-- public/                  # Static assets
|   |   +-- Dockerfile
|   |   +-- next.config.ts
|   |
|   +-- api/                         # NestJS REST API
|   |   +-- src/
|   |   |   +-- main.ts              # Bootstrap
|   |   |   +-- app.module.ts        # Root module
|   |   |   +-- modules/
|   |   |   |   +-- auth/            # Auth module
|   |   |   |   +-- users/           # Users module
|   |   |   |   +-- organizations/   # Org management
|   |   |   |   +-- documents/       # Document CRUD + upload
|   |   |   |   +-- processing/      # Processing status
|   |   |   |   +-- search/          # Hybrid search
|   |   |   |   +-- conversations/   # Chat module
|   |   |   |   +-- review/          # HITL verification
|   |   |   |   +-- audit/           # Audit log read API
|   |   |   +-- common/
|   |   |       +-- filters/         # Global exception filters
|   |   |       +-- guards/          # Auth, rate-limit guards
|   |   |       +-- interceptors/    # Logging, transform interceptors
|   |   |       +-- decorators/      # Custom decorators
|   |   |       +-- pipes/           # Validation pipes
|   |   +-- Dockerfile
|   |
|   +-- worker/                      # NestJS Worker (BullMQ processors)
|       +-- src/
|       |   +-- main.ts
|       |   +-- app.module.ts
|       |   +-- processors/
|       |   |   +-- document.processor.ts
|       |   |   +-- ocr.processor.ts
|       |   |   +-- extraction.processor.ts
|       |   |   +-- embedding.processor.ts
|       |   |   +-- notification.processor.ts
|       |   +-- pipeline/
|       |       +-- stages/          # Each pipeline stage as a service
|       +-- Dockerfile
|
+-- packages/
|   +-- shared/                      # Types, DTOs, constants shared across apps
|   |   +-- src/
|   |       +-- types/
|   |       +-- dtos/
|   |       +-- constants/
|   |       +-- utils/
|   |       +-- validators/
|   |
|   +-- ai/                          # AI provider abstractions
|   |   +-- src/
|   |       +-- llm/
|   |       |   +-- llm.interface.ts
|   |       |   +-- openai.provider.ts
|   |       |   +-- gemini.provider.ts
|   |       |   +-- anthropic.provider.ts
|   |       |   +-- local.provider.ts
|   |       +-- embeddings/
|   |       |   +-- embedding.interface.ts
|   |       |   +-- openai-embedding.provider.ts
|   |       |   +-- local-embedding.provider.ts
|   |       +-- ocr/
|   |       |   +-- ocr.interface.ts
|   |       |   +-- paddle-ocr.provider.ts
|   |       |   +-- vlm-ocr.provider.ts
|   |       +-- agents/
|   |           +-- document.agent.ts
|   |           +-- tools/
|   |
|   +-- database/                    # Prisma schema, migrations, client
|   |   +-- prisma/
|   |   |   +-- schema.prisma
|   |   |   +-- migrations/
|   |   |   +-- seed.ts
|   |   +-- src/
|   |       +-- database.module.ts
|   |       +-- database.service.ts
|   |
|   +-- config/                      # Environment config management
|   |   +-- src/
|   |       +-- config.module.ts
|   |       +-- schemas/             # Zod env validation schemas
|   |
|   +-- types/                       # Shared TypeScript type definitions
|       +-- src/
|           +-- document.types.ts
|           +-- ocr.types.ts
|           +-- ai.types.ts
|           +-- queue.types.ts
|
+-- infra/
|   +-- docker/
|   |   +-- postgres/
|   |   |   +-- init.sql             # pgvector extension, DB setup
|   |   +-- redis/
|   |   |   +-- redis.conf
|   |   +-- minio/
|   |   |   +-- init.sh
|   |   +-- nginx/
|   |       +-- nginx.conf
|   +-- docker-compose.yml
|   +-- docker-compose.prod.yml
|
+-- docs/
|   +-- prd.md
|   +-- architecture.md
|   +-- plan.md
|   +-- agents.md
|   +-- api/                         # OpenAPI/Swagger docs
|
+-- .github/
|   +-- workflows/
|       +-- ci.yml
|       +-- cd.yml
|
+-- turbo.json                       # Turborepo config
+-- package.json                     # Root workspace package
+-- tsconfig.base.json               # Base TypeScript config
+-- .env.example                     # All environment variables documented
```

### Technology Stack Summary

| Layer | Technology | Justification |
|---|---|---|
| Frontend | Next.js 15 App Router, TypeScript | SSR, excellent DX, strong ecosystem |
| UI Library | shadcn/ui + Radix UI | Accessible, composable, customizable |
| Styling | Tailwind CSS | Utility-first, consistent design tokens |
| Animations | Framer Motion | Production-quality animations |
| Data Fetching | TanStack Query v5 | Cache management, background refresh |
| Forms | React Hook Form + Zod | Type-safe forms, runtime validation |
| API Framework | NestJS 10 | Dependency injection, modules, strong conventions |
| ORM | Prisma | Type-safe queries, excellent migration tooling |
| Database | PostgreSQL 16 + pgvector | Relational + vector in one DB |
| Cache | Redis 7 | Fast key-value, pub/sub, Lua scripting |
| Queue | BullMQ | Redis-backed, reliable, feature-rich |
| Object Storage | MinIO (dev) / S3 (prod) | S3-compatible API |
| Build System | Turborepo | Monorepo task orchestration, caching |
| Container | Docker | Reproducible environments |
| Orchestration | Docker Compose (dev), K8s (prod) | Scalable deployment |

---

## 3. Application Architecture

### 3.1 API Application (NestJS)

The API is a NestJS application using modular architecture. Each domain has its own module.

```typescript
// Module structure pattern
@Module({
  imports: [DatabaseModule, RedisModule, ConfigModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentsRepository,
    StorageService,
    QueueService,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
```

**NestJS Module Map:**

```
AppModule
  +-- ConfigModule (global)
  +-- DatabaseModule (global)
  +-- RedisModule (global)
  +-- LoggerModule (global)
  +-- AuthModule
  |     +-- JwtModule
  |     +-- PassportModule
  |     +-- UsersModule (imported)
  +-- UsersModule
  +-- OrganizationsModule
  +-- DocumentsModule
  |     +-- StorageModule
  |     +-- QueueModule
  +-- ProcessingModule
  +-- SearchModule
  |     +-- EmbeddingModule
  +-- ConversationsModule
  |     +-- AgentModule
  +-- ReviewModule
  +-- AuditModule
  +-- HealthModule
```

**Global Interceptors and Guards:**

- `RequestIdInterceptor`: Generates UUID for every request, sets `X-Request-Id` header
- `LoggingInterceptor`: Structured log per request (method, path, status, duration)
- `TransformInterceptor`: Wraps responses in `{ data, meta }` envelope
- `JwtAuthGuard`: Validates JWT on protected routes
- `RateLimitGuard`: Redis-backed sliding window rate limiter

### 3.2 Worker Application (NestJS)

Separate NestJS application that only processes BullMQ jobs. No HTTP server. Registers BullMQ processors.

```typescript
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_DOCUMENT_PROCESSING },
      { name: QUEUE_OCR_PROCESSING },
      { name: QUEUE_LLM_PROCESSING },
      { name: QUEUE_EMBEDDING_PROCESSING },
      { name: QUEUE_NOTIFICATION },
    ),
    DatabaseModule,
    OCRModule,
    LLMModule,
    EmbeddingModule,
  ],
  providers: [
    DocumentProcessor,
    OCRProcessor,
    ExtractionProcessor,
    EmbeddingProcessor,
    NotificationProcessor,
  ],
})
export class WorkerAppModule {}
```

### 3.3 Frontend Application (Next.js 15)

Uses the App Router with Server Components where possible, Client Components for interactive UI.

**Route Layout:**
```
app/
  layout.tsx                  # Root layout (providers, fonts)
  (auth)/
    login/page.tsx
    register/page.tsx
    forgot-password/page.tsx
  (app)/
    layout.tsx                # Authenticated layout (sidebar, navbar)
    dashboard/page.tsx
    documents/
      page.tsx                # Document list
      upload/page.tsx
      [id]/
        page.tsx              # Document detail view
        chat/page.tsx         # Document chat
        compare/page.tsx      # Version comparison
        review/page.tsx       # HITL review
    search/page.tsx
    settings/
      page.tsx
      profile/page.tsx
      api-keys/page.tsx
      organization/page.tsx
  api/
    auth/[...nextauth]/route.ts   # NextAuth routes (if used)
```

**Data Fetching Strategy:**
- Server Components: Initial data fetch (document list, document detail)
- TanStack Query: Polling for status updates, mutations (upload, chat)
- Server Actions: Form submissions (settings, profile updates)
- Streaming: Chat response streaming via ReadableStream

---

## 4. Database Design

### 4.1 Entity Relationship Overview

```
users
  |--- organizations (via organization_members)
  |--- documents
  |--- conversations
  |--- audit_logs

documents
  |--- document_versions
  |        |--- document_pages
  |        |--- ocr_results
  |        |--- document_chunks
  |                  |--- document_embeddings
  |--- document_fields (current version)
  |--- document_categories
  |--- processing_jobs
  |--- conversations
```

### 4.2 Full Schema (Prisma)

```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector", schema: "extensions")]
}

// ============================================================
// AUTH & USERS
// ============================================================

model User {
  id                String    @id @default(cuid())
  email             String    @unique
  emailVerified     Boolean   @default(false)
  passwordHash      String?
  name              String?
  avatarUrl         String?
  preferredLanguage String    @default("en")  // "hi" | "en"
  role              UserRole  @default(USER)
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lastLoginAt       DateTime?

  sessions          Session[]
  refreshTokens     RefreshToken[]
  oauthAccounts     OAuthAccount[]
  organizationMemberships OrganizationMember[]
  documents         Document[]
  conversations     Conversation[]
  auditLogs         AuditLog[]
  verificationEvents VerificationEvent[]
  apiKeys           ApiKey[]

  @@map("users")
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userAgent String?
  ipAddress String?
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@index([userId])
  @@map("sessions")
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  sessionId String?
  isRevoked Boolean  @default(false)
  createdAt DateTime @default(now())
  expiresAt DateTime
  revokedAt DateTime?

  @@index([userId])
  @@index([tokenHash])
  @@map("refresh_tokens")
}

model OAuthAccount {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider       String   // "google" | "github"
  providerUserId String
  accessToken    String?
  refreshToken   String?
  expiresAt      DateTime?
  createdAt      DateTime @default(now())

  @@unique([provider, providerUserId])
  @@index([userId])
  @@map("oauth_accounts")
}

// ============================================================
// ORGANIZATIONS
// ============================================================

model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  logoUrl     String?
  plan        PlanTier @default(FREE)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members     OrganizationMember[]
  documents   Document[]

  @@map("organizations")
}

model OrganizationMember {
  id             String           @id @default(cuid())
  organizationId String
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           OrgRole          @default(MEMBER)
  joinedAt       DateTime         @default(now())

  @@unique([organizationId, userId])
  @@map("organization_members")
}

// ============================================================
// DOCUMENTS
// ============================================================

model Document {
  id               String          @id @default(cuid())
  userId           String
  user             User            @relation(fields: [userId], references: [id])
  organizationId   String?
  organization     Organization?   @relation(fields: [organizationId], references: [id])
  title            String
  originalFileName String
  mimeType         String
  fileSizeBytes    Int
  currentVersionId String?
  status           DocumentStatus  @default(QUEUED)
  category         DocumentCategory?
  categoryConfidence Float?
  categoryOverride Boolean         @default(false)
  primaryLanguage  String?         // "hi" | "en" | "hi+en"
  secondaryLanguages String[]      @default([])
  tags             String[]        @default([])
  isDeleted        Boolean         @default(false)
  deletedAt        DateTime?
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  versions         DocumentVersion[]
  fields           DocumentField[]
  processingJobs   ProcessingJob[]
  conversations    Conversation[]
  auditLogs        AuditLog[]

  @@index([userId])
  @@index([organizationId])
  @@index([status])
  @@index([category])
  @@map("documents")
}

model DocumentVersion {
  id              String   @id @default(cuid())
  documentId      String
  document        Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  versionNumber   Int
  storageKey      String   @unique // path in object storage
  storageUrl      String?
  pageCount       Int?
  checksum        String
  uploadedByUserId String
  notes           String?
  processingStatus ProcessingStatus @default(QUEUED)
  processingStage  ProcessingStage  @default(FILE_VALIDATION)
  processingError  String?
  processingErrorCode String?
  retryCount      Int      @default(0)
  startedAt       DateTime?
  completedAt     DateTime?
  processingDurationMs Int?
  createdAt       DateTime @default(now())

  pages           DocumentPage[]
  ocrResults      OcrResult[]
  chunks          DocumentChunk[]
  extractedFields DocumentVersionField[]

  @@unique([documentId, versionNumber])
  @@index([documentId])
  @@map("document_versions")
}

model DocumentPage {
  id              String          @id @default(cuid())
  versionId       String
  version         DocumentVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  pageNumber      Int
  storageKey      String          // rendered image path
  width           Int?
  height          Int?
  language        String?
  confidence      Float?
  createdAt       DateTime        @default(now())

  ocrResults      OcrResult[]

  @@unique([versionId, pageNumber])
  @@index([versionId])
  @@map("document_pages")
}

model OcrResult {
  id              String          @id @default(cuid())
  versionId       String
  version         DocumentVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  pageId          String?
  page            DocumentPage?   @relation(fields: [pageId], references: [id])
  pageNumber      Int
  rawText         String
  blocks          Json            // Array<OcrBlock> stored as JSON
  pageConfidence  Float
  pageLanguage    String
  ocrProvider     String          // "paddle" | "vlm" | "indic"
  fallbackUsed    Boolean         @default(false)
  fallbackProvider String?
  processingTimeMs Int?
  createdAt       DateTime        @default(now())

  @@index([versionId])
  @@map("ocr_results")
}

model DocumentChunk {
  id              String          @id @default(cuid())
  versionId       String
  version         DocumentVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  chunkIndex      Int
  content         String
  contentHindi    String?         // If chunk is Hindi
  pageNumber      Int
  sectionTitle    String?
  headingLevel    Int?
  tokenCount      Int
  charCount       Int
  language        String?
  startChar       Int?
  endChar         Int?
  createdAt       DateTime        @default(now())

  embeddings      DocumentEmbedding[]
  citations       Citation[]

  // Full-text search
  contentTsv      Unsupported("tsvector")?

  @@index([versionId])
  @@index([pageNumber])
  @@map("document_chunks")
}

model DocumentEmbedding {
  id          String        @id @default(cuid())
  chunkId     String
  chunk       DocumentChunk @relation(fields: [chunkId], references: [id], onDelete: Cascade)
  documentId  String        // denormalized for faster filtering
  versionId   String        // denormalized for faster filtering
  embedding   Unsupported("vector(1536)")
  model       String        // embedding model name
  dimension   Int           @default(1536)
  createdAt   DateTime      @default(now())

  @@index([documentId])
  @@index([versionId])
  @@map("document_embeddings")
}

// Denormalized fields at document level (from current version)
model DocumentField {
  id              String        @id @default(cuid())
  documentId      String
  document        Document      @relation(fields: [documentId], references: [id], onDelete: Cascade)
  fieldName       String        // e.g. "deadline", "invoice_number"
  fieldType       FieldType
  rawValue        String
  normalizedValue Json?         // structured value (date, number, etc.)
  confidence      Float
  confidenceLevel ConfidenceLevel
  sourcePage      Int?
  sourceBbox      Json?         // [x1, y1, x2, y2]
  chunkId         String?
  extractionMethod String?      // "llm" | "regex" | "nlp"
  isVerified      Boolean       @default(false)
  verifiedBy      String?
  verifiedAt      DateTime?
  isRejected      Boolean       @default(false)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  verificationEvents VerificationEvent[]

  @@index([documentId])
  @@index([fieldName])
  @@map("document_fields")
}

// Fields extracted per version (for versioned comparison)
model DocumentVersionField {
  id              String          @id @default(cuid())
  versionId       String
  version         DocumentVersion @relation(fields: [versionId], references: [id])
  fieldName       String
  fieldType       FieldType
  rawValue        String
  normalizedValue Json?
  confidence      Float
  sourcePage      Int?
  sourceBbox      Json?
  extractionMethod String?
  createdAt       DateTime        @default(now())

  @@index([versionId])
  @@map("document_version_fields")
}

// ============================================================
// PROCESSING
// ============================================================

model ProcessingJob {
  id              String          @id @default(cuid())
  documentId      String
  document        Document        @relation(fields: [documentId], references: [id])
  versionId       String
  bullJobId       String?         // BullMQ job ID
  queueName       String
  status          ProcessingStatus @default(QUEUED)
  currentStage    ProcessingStage
  stageHistory    Json            @default("[]") // Array<{stage, status, startedAt, completedAt, error}>
  retryCount      Int             @default(0)
  maxRetries      Int             @default(3)
  errorCode       String?
  errorMessage    String?
  errorStack      String?
  startedAt       DateTime?
  completedAt     DateTime?
  durationMs      Int?
  metadata        Json?           // provider, model, etc.
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([documentId])
  @@index([status])
  @@map("processing_jobs")
}

// ============================================================
// CONVERSATIONS & CHAT
// ============================================================

model Conversation {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  documentId  String?
  document    Document? @relation(fields: [documentId], references: [id])
  title       String?
  language    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  messages    Message[]

  @@index([userId])
  @@index([documentId])
  @@map("conversations")
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           MessageRole  // USER | ASSISTANT | SYSTEM | TOOL
  content        String
  language       String?
  metadata       Json?        // tool_calls, tool_results, model, tokens_used, latency_ms
  createdAt      DateTime     @default(now())

  citations      Citation[]

  @@index([conversationId])
  @@map("messages")
}

model Citation {
  id          String    @id @default(cuid())
  messageId   String
  message     Message   @relation(fields: [messageId], references: [id], onDelete: Cascade)
  chunkId     String
  chunk       DocumentChunk @relation(fields: [chunkId], references: [id])
  documentId  String
  versionId   String
  pageNumber  Int
  sectionTitle String?
  bbox        Json?     // bounding box on page
  relevanceScore Float?
  createdAt   DateTime  @default(now())

  @@index([messageId])
  @@index([documentId])
  @@map("citations")
}

// ============================================================
// HITL VERIFICATION
// ============================================================

model VerificationEvent {
  id          String       @id @default(cuid())
  fieldId     String
  field       DocumentField @relation(fields: [fieldId], references: [id])
  userId      String
  user        User         @relation(fields: [userId], references: [id])
  action      VerificationAction // ACCEPTED | EDITED | REJECTED
  previousValue String?
  newValue    String?
  reason      String?
  createdAt   DateTime     @default(now())

  @@index([fieldId])
  @@index([userId])
  @@map("verification_events")
}

model ClassificationCorrection {
  id                  String           @id @default(cuid())
  documentId          String           @unique
  aiCategory          DocumentCategory
  aiConfidence        Float
  userCategory        DocumentCategory
  reason              String?
  correctedByUserId   String
  createdAt           DateTime         @default(now())

  @@map("classification_corrections")
}

// ============================================================
// AUDIT LOGGING
// ============================================================

model AuditLog {
  id           String   @id @default(cuid())
  eventType    String
  actorId      String?
  actor        User?    @relation(fields: [actorId], references: [id])
  resourceType String
  resourceId   String
  changes      Json?
  ipAddress    String?
  userAgent    String?
  requestId    String?
  createdAt    DateTime @default(now())

  documentId   String?
  document     Document? @relation(fields: [documentId], references: [id])

  @@index([actorId])
  @@index([resourceType, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}

// ============================================================
// API KEYS
// ============================================================

model ApiKey {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  name        String
  keyHash     String   @unique
  keyPrefix   String   // First 8 chars for identification
  scopes      String[]
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([keyHash])
  @@map("api_keys")
}

// ============================================================
// ENUMS
// ============================================================

enum UserRole {
  ADMIN
  USER
}

enum OrgRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

enum PlanTier {
  FREE
  PRO
  BUSINESS
  ENTERPRISE
}

enum DocumentStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  NEEDS_REVIEW
}

enum ProcessingStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}

enum ProcessingStage {
  FILE_VALIDATION
  FILE_STORAGE
  PDF_RENDERING
  IMAGE_PREPROCESSING
  OCR
  LANGUAGE_DETECTION
  DOCUMENT_CLASSIFICATION
  TEXT_NORMALIZATION
  STRUCTURED_EXTRACTION
  CONFIDENCE_SCORING
  VALIDATION
  CHUNKING
  EMBEDDING
  INDEXING
  COMPLETED
}

enum DocumentCategory {
  GOVERNMENT_NOTICE
  INVOICE
  RECEIPT
  CERTIFICATE
  COLLEGE_DOCUMENT
  BANK_DOCUMENT
  LEGAL_DOCUMENT
  EMPLOYMENT_DOCUMENT
  FORM
  LETTER
  IDENTITY_DOCUMENT
  MEDICAL_DOCUMENT
  INSURANCE_DOCUMENT
  TAX_DOCUMENT
  UNKNOWN
}

enum FieldType {
  TEXT
  DATE
  NUMBER
  CURRENCY
  LIST
  BOOLEAN
  ADDRESS
  NAME
  ID_NUMBER
}

enum ConfidenceLevel {
  HIGH
  MEDIUM
  LOW
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
  TOOL
}

enum VerificationAction {
  ACCEPTED
  EDITED
  REJECTED
}
```

### 4.3 Key Database Indexes

```sql
-- pgvector HNSW index for approximate nearest neighbor search
CREATE INDEX ON document_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Full-text search index for document chunks
CREATE INDEX ON document_chunks
USING gin(content_tsv);

-- Trigger to update tsvector on insert/update
CREATE TRIGGER tsvector_update_trigger
BEFORE INSERT OR UPDATE ON document_chunks
FOR EACH ROW EXECUTE FUNCTION
tsvector_update_trigger(content_tsv, 'pg_catalog.english', content);

-- Hindi full-text search (requires hindi dictionary or simple)
-- Use pg_trgm for substring search on Hindi text
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ON document_chunks USING gin(content gin_trgm_ops);

-- Composite indexes for common query patterns
CREATE INDEX ON document_fields (document_id, field_name, confidence);
CREATE INDEX ON processing_jobs (document_id, status, created_at);
CREATE INDEX ON messages (conversation_id, created_at);
CREATE INDEX ON audit_logs (actor_id, created_at);
CREATE INDEX ON audit_logs (resource_type, resource_id, created_at);
```

---

## 5. API Design

### 5.1 REST API Conventions

**Base URL:** `/api/v1`

**Response Envelope:**
```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-08-19T00:00:00Z"
  }
}
```

**Error Response:**
```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document with ID xyz not found",
    "details": {},
    "requestId": "req_abc123"
  }
}
```

### 5.2 API Endpoints

#### Authentication
```
POST   /api/v1/auth/register          # Register new user
POST   /api/v1/auth/login             # Login, returns access + refresh token
POST   /api/v1/auth/logout            # Revoke refresh token
POST   /api/v1/auth/refresh           # Refresh access token
POST   /api/v1/auth/forgot-password   # Send password reset email
POST   /api/v1/auth/reset-password    # Reset password with token
GET    /api/v1/auth/google            # Initiate Google OAuth
GET    /api/v1/auth/google/callback   # Google OAuth callback
GET    /api/v1/auth/me                # Get current user
```

#### Documents
```
GET    /api/v1/documents              # List documents (paginated, filtered)
POST   /api/v1/documents              # Create document record + get upload URL
GET    /api/v1/documents/:id          # Get document detail
PATCH  /api/v1/documents/:id          # Update document (title, tags, category)
DELETE /api/v1/documents/:id          # Soft delete document
POST   /api/v1/documents/:id/confirm-upload  # Confirm S3 upload complete, enqueue job
GET    /api/v1/documents/:id/status   # Get processing status (polling)
POST   /api/v1/documents/:id/reprocess # Re-trigger processing
GET    /api/v1/documents/:id/pages    # List pages with OCR data
GET    /api/v1/documents/:id/pages/:pageNum # Get specific page
GET    /api/v1/documents/:id/fields   # Get extracted fields
PATCH  /api/v1/documents/:id/fields/:fieldId # Update/verify a field
DELETE /api/v1/documents/:id/fields/:fieldId # Reject a field
GET    /api/v1/documents/:id/ocr      # Get raw OCR output
```

#### Document Versions
```
GET    /api/v1/documents/:id/versions           # List versions
POST   /api/v1/documents/:id/versions           # Create new version
GET    /api/v1/documents/:id/versions/:vId      # Get specific version
GET    /api/v1/documents/:id/versions/compare   # Compare two versions
  ?v1=versionId1&v2=versionId2
```

#### Search
```
GET    /api/v1/search                 # Hybrid search across all documents
  ?q=query&mode=hybrid&category=INVOICE&lang=hi&page=1&limit=20
POST   /api/v1/search/semantic        # Semantic search only
POST   /api/v1/search/keyword         # Full-text keyword search
```

#### Conversations
```
GET    /api/v1/conversations          # List conversations
POST   /api/v1/conversations          # Create conversation
GET    /api/v1/conversations/:id      # Get conversation with messages
DELETE /api/v1/conversations/:id      # Delete conversation
POST   /api/v1/conversations/:id/messages  # Send message, get response (streaming)
GET    /api/v1/conversations/:id/messages  # Get message history
```

#### Review (HITL)
```
GET    /api/v1/review                 # Get review queue (low-confidence fields)
GET    /api/v1/review/stats           # Review queue stats
POST   /api/v1/review/:fieldId/accept # Accept field value
POST   /api/v1/review/:fieldId/edit   # Edit field value
POST   /api/v1/review/:fieldId/reject # Reject field
```

#### Organizations
```
GET    /api/v1/organizations          # List user's organizations
POST   /api/v1/organizations          # Create organization
GET    /api/v1/organizations/:id      # Get org detail
PATCH  /api/v1/organizations/:id      # Update org
GET    /api/v1/organizations/:id/members # List members
POST   /api/v1/organizations/:id/members # Invite member
DELETE /api/v1/organizations/:id/members/:userId # Remove member
```

#### Analytics & Audit
```
GET    /api/v1/analytics/dashboard    # Dashboard stats
GET    /api/v1/analytics/documents    # Document analytics
GET    /api/v1/audit-logs             # Audit log (admin only, paginated)
```

#### Upload
```
POST   /api/v1/upload/presign         # Get presigned upload URL
POST   /api/v1/upload/confirm         # Confirm upload, return document ID
```

---

## 6. Processing Pipeline Architecture

### 6.1 Pipeline Overview

The pipeline is orchestrated by BullMQ. The main `document-processing` queue coordinates child jobs on specialized queues.

```
document-processing queue
  Job: process-document
    |
    Stage 1-4: FILE_VALIDATION, FILE_STORAGE, PDF_RENDERING, IMAGE_PREPROCESSING
    (done in-process by main document processor)
    |
    +-- Spawns job on: ocr-processing queue
          Job: process-ocr
            |
            Stage 5-8: OCR, LANGUAGE_DETECTION, CLASSIFICATION, TEXT_NORMALIZATION
            |
            +-- Spawns job on: llm-processing queue
                  Job: extract-fields
                    |
                    Stage 9-11: STRUCTURED_EXTRACTION, CONFIDENCE_SCORING, VALIDATION
                    |
                    +-- Spawns job on: embedding-processing queue
                          Job: embed-document
                            |
                            Stage 12-15: CHUNKING, EMBEDDING, INDEXING, COMPLETED
```

### 6.2 Stage Implementation Pattern

Each processing stage is a separate service class:

```typescript
// Example: OCR Stage
@Injectable()
export class OcrStage implements PipelineStage {
  readonly name = ProcessingStage.OCR;

  constructor(
    private readonly ocrFactory: OCRProviderFactory,
    private readonly processingJobService: ProcessingJobService,
    private readonly ocrResultRepository: OcrResultRepository,
  ) {}

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const { versionId, documentId, jobId } = context;

    await this.processingJobService.updateStage(jobId, {
      stage: ProcessingStage.OCR,
      status: 'RUNNING',
      startedAt: new Date(),
    });

    try {
      const provider = this.ocrFactory.getProvider(context.config.ocrProvider);
      const pages = await this.getRenderedPages(versionId);

      const ocrResults = await Promise.all(
        pages.map(page => provider.processPage(page))
      );

      await this.ocrResultRepository.saveMany(versionId, ocrResults);

      await this.processingJobService.updateStage(jobId, {
        stage: ProcessingStage.OCR,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      return { ...context, ocrResults };
    } catch (error) {
      await this.processingJobService.updateStage(jobId, {
        stage: ProcessingStage.OCR,
        status: 'FAILED',
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw error;
    }
  }
}
```

### 6.3 Job Idempotency

Jobs are idempotent by:
1. Checking current stage before executing
2. Using upsert semantics for database writes
3. Using `IF NOT EXISTS` for storage operations
4. Storing `bullJobId` to detect duplicate dispatches

---

## 7. OCR Architecture

### 7.1 OCR Provider Interface

```typescript
// packages/ai/src/ocr/ocr.interface.ts

export interface OcrBlock {
  id: string;
  text: string;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  confidence: number;
  language: 'hi' | 'en' | 'mixed' | 'unknown';
  readingOrder: number;
  blockType: 'paragraph' | 'heading' | 'table' | 'list' | 'footer' | 'header';
}

export interface OcrPageResult {
  pageNumber: number;
  width: number;
  height: number;
  blocks: OcrBlock[];
  rawText: string;
  pageConfidence: number;
  pageLanguage: string;
  processingTimeMs: number;
  provider: string;
  fallbackUsed: boolean;
  fallbackProvider?: string;
}

export interface OcrInput {
  imagePath: string;     // local path or presigned URL
  pageNumber: number;
  documentId: string;
  language?: string;     // hint
  enableHandwriting?: boolean;
}

export interface OCRProvider {
  name: string;
  processPage(input: OcrInput): Promise<OcrPageResult>;
  isAvailable(): Promise<boolean>;
}
```

### 7.2 PaddleOCR Provider

PaddleOCR runs as a sidecar Python service, exposed via REST/gRPC. The Node.js provider calls it:

```typescript
@Injectable()
export class PaddleOCRProvider implements OCRProvider {
  readonly name = 'paddle';

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async processPage(input: OcrInput): Promise<OcrPageResult> {
    const paddleUrl = this.config.get('OCR_PADDLE_URL');
    const response = await this.httpService.post(`${paddleUrl}/ocr`, {
      image_path: input.imagePath,
      lang: 'ch', // PaddleOCR uses 'ch' for Hindi+Chinese chars
      enable_mkldnn: true,
    }).toPromise();

    return this.normalizeResponse(response.data, input.pageNumber);
  }

  private normalizeResponse(raw: any, pageNumber: number): OcrPageResult {
    // Transform PaddleOCR output format to our OcrPageResult
    const blocks = raw.result.map((item: any, idx: number) => ({
      id: `block_${pageNumber}_${idx}`,
      text: item.text,
      bbox: item.box.flat(), // PaddleOCR returns [[x1,y1],[x2,y2]...]
      confidence: item.score,
      language: this.detectBlockLanguage(item.text),
      readingOrder: idx,
      blockType: this.inferBlockType(item),
    }));

    return {
      pageNumber,
      blocks,
      rawText: blocks.map(b => b.text).join('\n'),
      pageConfidence: blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length,
      pageLanguage: this.detectPageLanguage(blocks),
      processingTimeMs: raw.time_cost * 1000,
      provider: 'paddle',
      fallbackUsed: false,
      width: raw.width,
      height: raw.height,
    };
  }
}
```

### 7.3 VLM Fallback Provider

For low-confidence blocks (< 0.7) or handwritten sections:

```typescript
@Injectable()
export class VLMOCRProvider implements OCRProvider {
  readonly name = 'vlm';

  async processPage(input: OcrInput): Promise<OcrPageResult> {
    const llm = this.llmFactory.getProvider('gemini'); // or qwen-vl
    const base64Image = await this.imageToBase64(input.imagePath);

    const response = await llm.complete({
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` }
          },
          {
            type: 'text',
            text: `Extract all text from this image. The document may contain Hindi (Devanagari script), English, or both. 
                   Return a JSON array of text blocks with their approximate positions and confidence.
                   Format: { blocks: [{text, bbox, confidence, language}] }`
          }
        ]
      }],
      responseFormat: 'json_object'
    });

    return this.parseVLMResponse(response, input.pageNumber);
  }
}
```

### 7.4 OCR Confidence Routing

```typescript
@Injectable()
export class OCROrchestrator {
  async processPage(input: OcrInput): Promise<OcrPageResult> {
    // Primary OCR attempt
    const primaryResult = await this.paddleProvider.processPage(input);

    // Check if fallback needed
    const lowConfBlocks = primaryResult.blocks.filter(b => b.confidence < 0.70);
    const fallbackThreshold = this.config.get('OCR_FALLBACK_THRESHOLD', 0.70);

    if (primaryResult.pageConfidence < fallbackThreshold) {
      // Entire page needs VLM fallback
      const vlmResult = await this.vlmProvider.processPage(input);
      return { ...vlmResult, fallbackUsed: true, fallbackProvider: 'vlm' };
    }

    if (lowConfBlocks.length > 0) {
      // Only re-process low-confidence blocks with VLM
      const enhanced = await this.enhanceLowConfidenceBlocks(primaryResult, lowConfBlocks);
      return enhanced;
    }

    return primaryResult;
  }
}
```

---

## 8. AI & LLM Architecture

### 8.1 LLM Provider Interface

```typescript
// packages/ai/src/llm/llm.interface.ts

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  toolCallId?: string;
  name?: string;
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  tools?: LLMTool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  responseFormat?: 'text' | 'json_object';
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  model?: string;
}

export interface LLMCompletionResponse {
  content: string | null;
  toolCalls?: LLMToolCall[];
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  latencyMs: number;
}

export interface LLMProvider {
  name: string;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
  stream(request: LLMCompletionRequest): AsyncIterable<string>;
  isAvailable(): Promise<boolean>;
}
```

### 8.2 LLM Provider Implementations

```typescript
// OpenAI Provider
@Injectable()
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const start = Date.now();
    const response = await this.openai.chat.completions.create({
      model: request.model ?? 'gpt-4o',
      messages: request.messages as any,
      tools: request.tools as any,
      tool_choice: request.toolChoice as any,
      response_format: request.responseFormat === 'json_object'
        ? { type: 'json_object' }
        : undefined,
      temperature: request.temperature ?? 0.1,
      max_tokens: request.maxTokens,
    });

    return this.normalizeResponse(response, Date.now() - start);
  }
}

// Factory for selecting providers
@Injectable()
export class LLMProviderFactory {
  getProvider(name?: string): LLMProvider {
    const providerName = name ?? this.config.get('DEFAULT_LLM_PROVIDER', 'openai');
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`LLM provider "${providerName}" not registered`);
    return provider;
  }

  async getAvailableProvider(preferred?: string): Promise<LLMProvider> {
    const order = preferred
      ? [preferred, ...this.config.get('LLM_FALLBACK_ORDER', [])]
      : this.config.get('LLM_FALLBACK_ORDER', ['openai', 'gemini']);

    for (const name of order) {
      const provider = this.providers.get(name);
      if (provider && await provider.isAvailable()) return provider;
    }
    throw new Error('No LLM provider available');
  }
}
```

### 8.3 Prompt Management

Prompts are stored in structured files, not hardcoded in services:

```
packages/ai/src/prompts/
  document-classification.prompt.ts
  structured-extraction.prompt.ts
  rag-answer.prompt.ts
  language-detection.prompt.ts
  document-comparison.prompt.ts
```

```typescript
// Example: RAG Answer Prompt
export const ragAnswerPrompt = (language: 'hi' | 'en' | 'hinglish') => ({
  system: `You are DocSaarthi, an intelligent document assistant specializing in Indian documents.
You help users understand their documents by answering questions based ONLY on the provided document excerpts.

CRITICAL RULES:
1. ONLY use information from the provided context chunks. Never use external knowledge.
2. If the answer is not in the context, say: "${language === 'hi' ? 'मुझे यह जानकारी आपके दस्तावेज़ों में नहीं मिली।' : 'I could not find this information in your documents.'}"
3. Always provide citations in format: [Document: {title}, Page {page}, Section: {section}]
4. Respond in the same language as the user's question.
5. For Hindi questions, respond in Hindi. For English, respond in English. For Hinglish, respond naturally.
6. Be concise and factual. No unnecessary elaboration.`,

  userTemplate: (question: string, chunks: ContextChunk[]) =>
    `Context from documents:
${chunks.map((c, i) => `
[Source ${i + 1}: ${c.documentTitle}, Page ${c.pageNumber}, ${c.sectionTitle ?? 'Section unknown'}]
${c.content}
`).join('\n---\n')}

Question: ${question}`
});
```

---

## 9. Embedding & Vector Search Architecture

### 9.1 Embedding Provider Interface

```typescript
export interface EmbeddingProvider {
  name: string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimension: number;
  maxTokens: number;
}
```

### 9.2 Multilingual Embedding Strategy

For optimal Hindi + English support:

**Option A (Recommended for Production):**
- Provider: OpenAI `text-embedding-3-small` (1536-dim)
- Supports multilingual including Devanagari natively
- Cost: $0.02/1M tokens

**Option B (Cost-Optimized / Self-hosted):**
- Model: `paraphrase-multilingual-MiniLM-L12-v2` (384-dim)
- Hosted via Hugging Face Inference Endpoint or FastAPI sidecar
- Supports 50+ languages including Hindi

**Option C (High-Quality, Higher Cost):**
- Provider: Gemini `text-embedding-004`
- Excellent multilingual performance

### 9.3 Vector Storage Schema

```sql
-- pgvector extension setup
CREATE EXTENSION IF NOT EXISTS vector;

-- The embedding column
ALTER TABLE document_embeddings
ADD COLUMN embedding vector(1536);

-- HNSW index (faster query, more memory)
CREATE INDEX ON document_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64, ef_search = 40);

-- IVFFLAT index (slower build, less memory — for larger datasets)
-- CREATE INDEX ON document_embeddings
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);
```

### 9.4 Similarity Search Query

```typescript
// Semantic similarity search
async semanticSearch(
  queryEmbedding: number[],
  options: SearchOptions
): Promise<SearchResult[]> {
  const results = await this.prisma.$queryRaw<SearchResult[]>`
    SELECT
      dc.id as chunk_id,
      dc.content,
      dc.page_number,
      dc.section_title,
      d.id as document_id,
      d.title as document_title,
      d.category,
      1 - (de.embedding <=> ${queryEmbedding}::vector) as semantic_score
    FROM document_embeddings de
    JOIN document_chunks dc ON de.chunk_id = dc.id
    JOIN document_versions dv ON dc.version_id = dv.id
    JOIN documents d ON dv.document_id = d.id
    WHERE
      d.user_id = ${options.userId}
      AND d.is_deleted = false
      ${options.documentId ? Prisma.sql`AND d.id = ${options.documentId}` : Prisma.empty}
      ${options.category ? Prisma.sql`AND d.category = ${options.category}` : Prisma.empty}
      AND 1 - (de.embedding <=> ${queryEmbedding}::vector) > ${options.minScore ?? 0.5}
    ORDER BY semantic_score DESC
    LIMIT ${options.limit ?? 10}
  `;

  return results;
}
```

---

## 10. RAG Architecture

### 10.1 RAG Pipeline

```
User Query
    |
    v
Query Preprocessor
    |
    +-- Language Detection (Hindi/English/Hinglish)
    |
    +-- Query Expansion (HyDE or synonyms)
    |
    v
Hybrid Retriever
    |
    +-- Semantic Search (pgvector)
    |
    +-- Full-text Search (PostgreSQL tsvector)
    |
    +-- Structured Query (for deterministic fields)
    |
    v
Result Merger & Scorer
    |
    +-- Score normalization
    |
    +-- Hybrid scoring (alpha * semantic + beta * keyword)
    |
    v
Re-ranker (Cross-encoder)
    |
    v
Context Builder
    |
    +-- Token budget management
    |
    +-- Chunk deduplication
    |
    +-- Source metadata attachment
    |
    v
LLM Answer Generation
    |
    v
Citation Extractor
    |
    v
Response + Citations
```

### 10.2 Context Window Management

```typescript
@Injectable()
export class ContextBuilder {
  private readonly MAX_CONTEXT_TOKENS = 8000; // Leave room for answer

  buildContext(chunks: ScoredChunk[], query: string): BuiltContext {
    let tokenCount = 0;
    const selectedChunks: ScoredChunk[] = [];

    // Sort by score, take highest scoring within token budget
    for (const chunk of chunks.sort((a, b) => b.score - a.score)) {
      const chunkTokens = this.countTokens(chunk.content);
      if (tokenCount + chunkTokens > this.MAX_CONTEXT_TOKENS) break;
      selectedChunks.push(chunk);
      tokenCount += chunkTokens;
    }

    return {
      chunks: selectedChunks,
      totalTokens: tokenCount,
      sourceDocs: this.extractSourceMetadata(selectedChunks),
    };
  }
}
```

### 10.3 Conversation Context Management

```typescript
// Multi-turn conversation: include recent turns but limit tokens
async buildConversationMessages(
  conversationId: string,
  newUserQuery: string,
  context: BuiltContext
): Promise<LLMMessage[]> {
  const recentMessages = await this.getRecentMessages(conversationId, 10);

  return [
    { role: 'system', content: ragAnswerPrompt(context.language).system },
    // Inject relevant context
    {
      role: 'user',
      content: `Here is relevant context from documents:\n${context.formatted}`
    },
    { role: 'assistant', content: 'Understood. I will answer based only on this context.' },
    // Recent conversation history (last 5 turns)
    ...recentMessages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
    // New user query
    { role: 'user', content: newUserQuery }
  ];
}
```

---

## 11. Queue & Worker Architecture

### 11.1 Queue Definitions

```typescript
// Queue names as constants
export const QUEUES = {
  DOCUMENT_PROCESSING: 'document-processing',
  OCR_PROCESSING: 'ocr-processing',
  LLM_PROCESSING: 'llm-processing',
  EMBEDDING_PROCESSING: 'embedding-processing',
  NOTIFICATION: 'notification-processing',
} as const;

// Queue configurations with BullMQ defaults
export const QUEUE_CONFIGS: Record<string, QueueOptions> = {
  [QUEUES.DOCUMENT_PROCESSING]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  },
  [QUEUES.OCR_PROCESSING]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      timeout: 120000, // 2 minutes per page
    },
  },
};
```

### 11.2 Worker Concurrency

```typescript
// Worker concurrency configured per queue based on resource intensity
@Processor(QUEUES.DOCUMENT_PROCESSING, { concurrency: 10 })
export class DocumentProcessor extends WorkerHost {
  async process(job: Job<DocumentJobData>): Promise<void> {
    // File validation, storage, PDF rendering are lightweight
    // so high concurrency is fine
  }
}

@Processor(QUEUES.OCR_PROCESSING, { concurrency: 3 })
export class OCRProcessor extends WorkerHost {
  // OCR is CPU-intensive. Limit to avoid overloading PaddleOCR sidecar
}

@Processor(QUEUES.LLM_PROCESSING, { concurrency: 5 })
export class LLMProcessor extends WorkerHost {
  // LLM calls are I/O bound (HTTP to LLM API)
  // but rate-limited by provider, so moderate concurrency
}

@Processor(QUEUES.EMBEDDING_PROCESSING, { concurrency: 5 })
export class EmbeddingProcessor extends WorkerHost {
  // Embedding calls are also I/O bound
}
```

### 11.3 Dead-Letter Queue Handling

```typescript
// Listen to failed jobs for alerting and manual intervention
export class DeadLetterHandler {
  @OnQueueEvent('failed')
  async onFailed(job: Job, error: Error) {
    if (job.attemptsMade >= job.opts.attempts!) {
      // Job is permanently failed — send to DLQ conceptually
      await this.processingJobService.markPermanentlyFailed(
        job.data.documentId,
        {
          errorCode: 'MAX_RETRIES_EXCEEDED',
          errorMessage: error.message,
          errorStack: error.stack,
        }
      );

      // Notify user
      await this.notificationQueue.add('processing-failed', {
        userId: job.data.userId,
        documentId: job.data.documentId,
        error: error.message,
      });

      // Send alert to monitoring
      await this.alertService.sendAlert({
        severity: 'ERROR',
        message: `Document processing permanently failed: ${job.data.documentId}`,
        metadata: { jobId: job.id, error: error.message },
      });
    }
  }
}
```

---

## 12. Authentication & Authorization Architecture

### 12.1 Token Architecture

```
Client
  |
  POST /auth/login
  |
  v
API
  |
  +-- Verify credentials
  |
  +-- Generate accessToken (JWT, 15min, signed with ACCESS_TOKEN_SECRET)
  |
  +-- Generate refreshToken (opaque random 64-byte, hashed in DB)
  |
  +-- Set cookies:
  |     access_token: HttpOnly, Secure, SameSite=Strict, 15min
  |     refresh_token: HttpOnly, Secure, SameSite=Strict, Path=/auth/refresh, 7days
  |
  +-- Return user data (no tokens in body)
```

### 12.2 JWT Claims

```typescript
export interface JwtAccessPayload {
  sub: string;          // user ID
  email: string;
  role: UserRole;
  sessionId: string;
  organizationIds: string[];
  iat: number;
  exp: number;
}
```

### 12.3 Authorization Guards

```typescript
// Route-level permission checking
@Injectable()
export class DocumentOwnerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { user } = request;
    const { id: documentId } = request.params;

    const document = await this.documentsService.findById(documentId);
    if (!document) throw new NotFoundException('Document not found');

    // Check ownership or org membership
    if (document.userId === user.sub) return true;
    if (document.organizationId) {
      const isMember = await this.orgService.isMember(
        document.organizationId, user.sub
      );
      return isMember;
    }

    throw new ForbiddenException('Access denied');
  }
}
```

### 12.4 Row-Level Security

All database queries are scoped to the authenticated user:

```typescript
// Repository pattern enforces data isolation
async findByUser(userId: string, options: FindDocumentsOptions) {
  return this.prisma.document.findMany({
    where: {
      userId,           // ALWAYS filter by userId
      isDeleted: false,
      ...options.filters,
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit,
    skip: options.offset,
    include: options.include,
  });
}
```

---

## 13. Object Storage Architecture

### 13.1 Upload Flow

```
1. Client requests: POST /upload/presign { filename, mimeType, fileSize }
2. API validates: MIME type, file extension, file size limits
3. API generates: documentId, versionId, storageKey
   storageKey = `${userId}/${documentId}/${versionId}/${sanitizedFilename}`
4. API calls MinIO/S3: createPresignedPost (not PutObject)
   - Conditions: content-type must match, max content-length enforced
5. API returns: { uploadUrl, fields, documentId }
6. Client uploads directly to MinIO/S3 (bypasses API server)
7. Client calls: POST /upload/confirm { documentId, versionId }
8. API verifies file exists in storage (HEAD request)
9. API enqueues: document.process job
10. API returns: { documentId, status: "QUEUED" }
```

### 13.2 Storage Key Convention

```typescript
export function generateStorageKey(
  userId: string,
  documentId: string,
  versionId: string,
  originalFilename: string,
  type: 'original' | 'rendered_page' | 'thumbnail'
): string {
  const safeFilename = sanitizeFilename(originalFilename);

  switch (type) {
    case 'original':
      return `documents/${userId}/${documentId}/${versionId}/original/${safeFilename}`;
    case 'rendered_page':
      return `documents/${userId}/${documentId}/${versionId}/pages/${safeFilename}`;
    case 'thumbnail':
      return `documents/${userId}/${documentId}/${versionId}/thumbnail.webp`;
  }
}
```

---

## 14. Search Architecture

### 14.1 Hybrid Search Implementation

```typescript
@Injectable()
export class HybridSearchService {
  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly prisma: PrismaService,
  ) {}

  async search(query: string, options: SearchOptions): Promise<HybridSearchResult[]> {
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, options),
      this.keywordSearch(query, options),
    ]);

    return this.mergeAndRerank(semanticResults, keywordResults, options);
  }

  private async keywordSearch(query: string, options: SearchOptions) {
    // PostgreSQL full-text search with tsquery
    // Supports both English and Hindi (via pg_trgm for Hindi)
    return this.prisma.$queryRaw`
      SELECT
        dc.id as chunk_id,
        dc.content,
        dc.page_number,
        d.id as document_id,
        d.title as document_title,
        ts_rank(dc.content_tsv, plainto_tsquery('english', ${query})) as keyword_score
      FROM document_chunks dc
      JOIN document_versions dv ON dc.version_id = dv.id
      JOIN documents d ON dv.document_id = d.id
      WHERE
        d.user_id = ${options.userId}
        AND d.is_deleted = false
        AND (
          dc.content_tsv @@ plainto_tsquery('english', ${query})
          OR dc.content ILIKE ${'%' + query + '%'}  -- pg_trgm fallback
        )
      ORDER BY keyword_score DESC
      LIMIT 20
    `;
  }

  private mergeAndRerank(
    semantic: any[],
    keyword: any[],
    options: SearchOptions
  ): HybridSearchResult[] {
    const alpha = options.semanticWeight ?? 0.6;
    const beta = 1 - alpha;

    const allChunkIds = new Set([
      ...semantic.map(r => r.chunk_id),
      ...keyword.map(r => r.chunk_id),
    ]);

    const merged = Array.from(allChunkIds).map(chunkId => {
      const sem = semantic.find(r => r.chunk_id === chunkId);
      const kw = keyword.find(r => r.chunk_id === chunkId);

      const semScore = sem ? this.normalizeScore(sem.semantic_score) : 0;
      const kwScore = kw ? this.normalizeScore(kw.keyword_score) : 0;

      return {
        chunkId,
        content: (sem ?? kw)!.content,
        documentId: (sem ?? kw)!.document_id,
        documentTitle: (sem ?? kw)!.document_title,
        pageNumber: (sem ?? kw)!.page_number,
        semanticScore: semScore,
        keywordScore: kwScore,
        finalScore: (alpha * semScore) + (beta * kwScore),
      };
    });

    return merged
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, options.limit ?? 10);
  }
}
```

---

## 15. Caching Architecture

### 15.1 Cache Layers

| Cache Key Pattern | TTL | Purpose |
|---|---|---|
| `user:{userId}:profile` | 5 min | User profile data |
| `doc:{documentId}:fields` | 10 min | Extracted fields (cleared on update) |
| `doc:{documentId}:status` | 30 sec | Processing status |
| `search:{userId}:{queryHash}` | 5 min | Search results |
| `embed:{textHash}` | 24 hr | Embedding cache (same text) |
| `rate:{userId}:{endpoint}` | Sliding | Rate limit counters |
| `session:{sessionId}` | 15 min | Session data |

### 15.2 Cache Implementation

```typescript
@Injectable()
export class CacheService {
  constructor(private readonly redis: Redis) {}

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as T;

    const value = await factory();
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    return value;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

---

## 16. Observability Architecture

### 16.1 Structured Logging

Every log entry includes:
```json
{
  "level": "info",
  "timestamp": "2026-08-19T00:00:00.000Z",
  "requestId": "req_abc123",
  "userId": "user_xyz",
  "service": "api",
  "module": "DocumentsService",
  "method": "processDocument",
  "documentId": "doc_123",
  "durationMs": 234,
  "message": "Document processing started"
}
```

### 16.2 Request Tracing

```typescript
// RequestIdInterceptor assigns UUID to every request
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'] ?? uuidv4();
    request.requestId = requestId;

    // Set in AsyncLocalStorage for downstream services
    return asyncLocalStorage.run({ requestId }, () => next.handle());
  }
}
```

### 16.3 Metrics Collection

Key metrics to track:
- `document_uploads_total` (counter)
- `document_processing_duration_seconds` (histogram, by stage)
- `ocr_confidence_score` (histogram, by provider)
- `llm_tokens_used_total` (counter, by provider and model)
- `search_query_duration_seconds` (histogram, by mode)
- `chat_response_duration_seconds` (histogram)
- `queue_job_duration_seconds` (histogram, by queue and status)
- `http_requests_total` (counter, by method, path, status)
- `http_request_duration_seconds` (histogram)

---

## 17. Frontend Architecture

### 17.1 Component Architecture

```
app/
  (app)/
    documents/[id]/page.tsx (Server Component)
      |
      +-- Suspense boundary
      |     +-- DocumentDetail (Client Component)
      |           +-- DocumentViewer (left panel)
      |           |     +-- PDFViewer / ImageViewer
      |           |     +-- PageNavigation
      |           |     +-- OcrOverlay
      |           +-- DocumentInfo (right panel)
      |                 +-- FieldList (with confidence badges)
      |                 +-- FieldEditor (inline edit)
      |                 +-- CategoryBadge
      |                 +-- VersionSelector
      |
      +-- DocumentChat (Client Component, lazy loaded)
            +-- MessageList
            +-- MessageInput
            +-- CitationPanel
```

### 17.2 State Management

- **Server state:** TanStack Query (documents, messages, fields, search)
- **UI state:** React useState/useReducer (local component state)
- **Global UI state:** Zustand (sidebar open/close, selected document, active theme)
- **Form state:** React Hook Form with Zod validation

### 17.3 Real-time Updates

```typescript
// Poll for document processing status until completed or failed
export function useDocumentStatus(documentId: string) {
  return useQuery({
    queryKey: ['document', documentId, 'status'],
    queryFn: () => api.getDocumentStatus(documentId),
    refetchInterval: (data) => {
      if (!data) return 2000;
      if (data.status === 'COMPLETED' || data.status === 'FAILED') return false;
      return 2000; // Poll every 2 seconds while processing
    },
  });
}
```

### 17.4 Streaming Chat

```typescript
async function sendMessage(conversationId: string, content: string) {
  const response = await fetch(
    `/api/v1/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ content }),
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // Server-Sent Events format
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'token') accumulated += data.content;
      if (data.type === 'done') return { content: accumulated, citations: data.citations };
    }
  }
}
```

---

## 18. Infrastructure & DevOps

### 18.1 Docker Compose (Development)

```yaml
# infra/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: docsaarthi
      POSTGRES_USER: docsaarthi
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U docsaarthi"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server /usr/local/etc/redis/redis.conf
    volumes:
      - redis_data:/data
      - ./infra/docker/redis/redis.conf:/usr/local/etc/redis/redis.conf
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  paddle-ocr:
    build:
      context: ./infra/docker/paddle-ocr
      dockerfile: Dockerfile
    ports:
      - "8081:8081"
    volumes:
      - ocr_models:/models
    environment:
      - CUDA_VISIBLE_DEVICES=0
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]   # Optional GPU support

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      - DATABASE_URL=postgresql://docsaarthi:${POSTGRES_PASSWORD}@postgres:5432/docsaarthi
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio
      - MINIO_PORT=9000
      - OCR_PADDLE_URL=http://paddle-ocr:8081
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    environment:
      - DATABASE_URL=postgresql://docsaarthi:${POSTGRES_PASSWORD}@postgres:5432/docsaarthi
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio
      - OCR_PADDLE_URL=http://paddle-ocr:8081
    depends_on:
      - postgres
      - redis
      - paddle-ocr
    deploy:
      replicas: 2

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      - NEXT_PUBLIC_API_URL=http://api:3001
    ports:
      - "3000:3000"
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
  minio_data:
  ocr_models:
```

### 18.2 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: docsaarthi_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/docsaarthi_test
          REDIS_URL: redis://localhost:6379

  build:
    needs: [lint-and-type-check, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build

  docker-build:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/api/Dockerfile
          push: false
          tags: docsaarthi/api:${{ github.sha }}
```

### 18.3 Environment Configuration

```bash
# .env.example — All environment variables documented

# ========== DATABASE ==========
DATABASE_URL=postgresql://docsaarthi:password@localhost:5432/docsaarthi

# ========== REDIS ==========
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=docsaarthi:

# ========== OBJECT STORAGE ==========
STORAGE_PROVIDER=minio  # or "s3"
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=docsaarthi
MINIO_USE_SSL=false

# ========== AUTH ==========
ACCESS_TOKEN_SECRET=<64-byte-random-secret>
REFRESH_TOKEN_SECRET=<64-byte-random-secret>
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
BCRYPT_ROUNDS=12

# ========== GOOGLE OAUTH ==========
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback

# ========== AI PROVIDERS ==========
DEFAULT_LLM_PROVIDER=openai
LLM_FALLBACK_ORDER=openai,gemini
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# ========== OCR ==========
OCR_PROVIDER=paddle
OCR_PADDLE_URL=http://localhost:8081
OCR_FALLBACK_THRESHOLD=0.70
OCR_VLM_PROVIDER=gemini

# ========== EMBEDDINGS ==========
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

# ========== RATE LIMITING ==========
RATE_LIMIT_UPLOAD=10  # per minute per user
RATE_LIMIT_CHAT=30
RATE_LIMIT_SEARCH=60
RATE_LIMIT_AUTH=5     # per 15 minutes per IP

# ========== FEATURE FLAGS ==========
ENABLE_HANDWRITING_OCR=true
ENABLE_GOOGLE_OAUTH=false
ENABLE_EMAIL_VERIFICATION=false
MAX_FILE_SIZE_BYTES=52428800  # 50MB
MAX_PAGES_PER_DOCUMENT=100

# ========== OBSERVABILITY ==========
LOG_LEVEL=info
SENTRY_DSN=
```

---

## 19. Security Architecture

### 19.1 Defense-in-Depth

```
Layer 1: Network
  - HTTPS/TLS 1.3 only
  - HSTS headers
  - CDN-level DDoS protection

Layer 2: Application
  - JWT with short expiry
  - HTTP-only cookies
  - CSRF protection (SameSite=Strict)
  - Rate limiting per user/IP
  - Input validation (Zod)

Layer 3: API
  - Authentication on all routes
  - Authorization guard per resource
  - Row-level data isolation
  - No raw SQL with user input

Layer 4: Storage
  - Presigned URLs (time-limited)
  - Bucket policies (no public access)
  - Storage keys include UUID (not guessable)
  - Server-side encryption

Layer 5: Database
  - Parameterized queries only
  - Least-privilege DB user
  - Secrets in environment vars only
  - Encrypted at rest
```

### 19.2 File Upload Security

```typescript
@Injectable()
export class FileSecurityService {
  private readonly MAGIC_BYTES: Record<string, string[]> = {
    'application/pdf': ['%PDF'],
    'image/png': ['\x89PNG'],
    'image/jpeg': ['\xFF\xD8\xFF'],
    'image/webp': ['RIFF'],
  };

  async validateFile(buffer: Buffer, declaredMimeType: string): Promise<void> {
    // 1. Check magic bytes (do not trust Content-Type header)
    const detectedMime = await fileTypeFromBuffer(buffer);
    if (!detectedMime || !this.SUPPORTED_TYPES.includes(detectedMime.mime)) {
      throw new UnsupportedMediaTypeException('File type not supported');
    }

    // 2. Verify declared type matches detected type
    if (detectedMime.mime !== declaredMimeType) {
      throw new BadRequestException('Declared MIME type does not match file content');
    }

    // 3. Check for file bombs (compressed PDF/ZIP bombs)
    if (detectedMime.mime === 'application/pdf') {
      await this.validatePDFSafety(buffer);
    }

    // 4. Virus scan (if ClamAV available)
    if (this.config.get('ENABLE_VIRUS_SCAN')) {
      await this.virusScanService.scan(buffer);
    }
  }
}
```

---

## 20. Data Flow Diagrams

### 20.1 Document Upload Flow

```
Browser                    API                     MinIO/S3              BullMQ
  |                         |                          |                    |
  |--POST /upload/presign-->|                          |                    |
  |                         |--validate file meta----->|                    |
  |                         |--createPresignedPost----->|                    |
  |                         |<--{ uploadUrl, fields }--|                    |
  |<--{ uploadUrl, docId }--|                          |                    |
  |                         |                          |                    |
  |--PUT {uploadUrl} ------>|------------------------->|                    |
  |<--200 OK----------------|<-------------------------|                    |
  |                         |                          |                    |
  |--POST /upload/confirm-->|                          |                    |
  |                         |--HEAD (verify exists)--->|                    |
  |                         |<--200 OK-----------------|                    |
  |                         |--enqueue doc.process---->|                    |
  |<--{ docId, QUEUED }-----|                          |                    |
```

### 20.2 Chat / RAG Flow

```
Browser                    API                      pgvector           LLM API
  |                          |                          |                  |
  |--POST /conv/:id/msgs---->|                          |                  |
  |                          |--detect language---------|                  |
  |                          |--generate embedding------|                  |
  |                          |--semantic search-------->|                  |
  |                          |<--top chunks-------------|                  |
  |                          |--keyword search--------->|                  |
  |                          |<--keyword results--------|                  |
  |                          |--merge + rerank----------|                  |
  |                          |--build context-----------|                  |
  |                          |--stream prompt-----------|----------------->|
  |<--SSE stream tokens------|<---------------------------------tokens-----|
  |                          |--save message + citations|                  |
  |<--[done] + citations-----|                          |                  |
```

---

*Architecture Document — DocSaarthi v1.0.0 — August 2026*
*For internal engineering use. Do not distribute externally.*
