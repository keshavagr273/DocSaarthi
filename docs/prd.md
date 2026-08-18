# DocSaarthi — Product Requirements Document (PRD)

> **Version:** 1.0.0  
> **Date:** August 2026  
> **Status:** Draft for Founding Team Review  
> **Classification:** Confidential

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Vision & Mission](#3-vision--mission)
4. [Market Opportunity](#4-market-opportunity)
5. [Target Users & Personas](#5-target-users--personas)
6. [User Journey & Stories](#6-user-journey--stories)
7. [Core Product Features](#7-core-product-features)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [AI & Intelligence Requirements](#9-ai--intelligence-requirements)
10. [Multilingual Requirements](#10-multilingual-requirements)
11. [Security & Compliance](#11-security--compliance)
12. [Monetization Strategy](#12-monetization-strategy)
13. [Go-to-Market Strategy](#13-go-to-market-strategy)
14. [Success Metrics & KPIs](#14-success-metrics--kpis)
15. [Roadmap](#15-roadmap)
16. [Risks & Mitigations](#16-risks--mitigations)
17. [Appendix](#17-appendix)

---

## 1. Executive Summary

**DocSaarthi** (literally meaning "Document Companion" in Hindi) is a multilingual Indian document intelligence platform designed to help individuals, students, government beneficiaries, small businesses, and enterprises upload, understand, query, and act on Indian documents written in Hindi, English, or mixed Hindi-English.

India is a nation where millions of people struggle daily with document comprehension — government notices they cannot understand, legal forms in dense legalese, scholarship notifications buried in PDFs, invoices in mixed languages. DocSaarthi bridges this gap by combining state-of-the-art Optical Character Recognition (OCR), Large Language Models (LLMs), and multilingual retrieval-augmented generation (RAG) into a single, cohesive product.

### What Makes DocSaarthi Different

| Capability | Traditional Document Tools | DocSaarthi |
|---|---|---|
| OCR accuracy for Devanagari script | Poor | Excellent (PaddleOCR + VLM fallback) |
| Hindi/Hinglish query support | None | Native |
| Structured extraction from govt. docs | None | Schema-driven extraction |
| Handwritten document support | None | Partial (VLM fallback) |
| Citation-aware answers | None | Full page/section citations |
| Human-in-the-loop verification | None | Built-in |
| Document comparison | Basic text diff | Semantic + structural diff |
| Conversational intelligence | None | RAG-powered multi-turn chat |

---

## 2. Problem Statement

### 2.1 The Indian Document Problem

India has over 1.4 billion citizens. A significant fraction of these citizens:

- **Regularly receive government documents** they cannot fully comprehend due to complex language, dense formatting, or bilingual content
- **File physical or scanned paperwork** with no digital search or retrieval capability
- **Lose track of deadlines** mentioned in notices they never properly read
- **Cannot extract actionable information** from official letters, certificates, invoices, and forms

### 2.2 Specific Pain Points

#### For Individual Citizens
- Government notices arrive in dense Hindi or English bureaucratic language
- Students receive scholarship/admission notifications that require careful parsing
- Bank statements, insurance documents, and loan agreements are complex
- Aadhaar, PAN, and other identity documents need to be linked, compared, or verified

#### For Small & Medium Businesses
- Invoices, receipts, and GST documents arrive in varied formats
- Vendor agreements and employment documents need structured extraction
- Multiple document versions exist with no diff/comparison tool
- Teams waste hours manually reading and re-typing information from scanned documents

#### For Government & NGO Workers
- Processing of citizen documents is manual, slow, and error-prone
- Language barriers slow down service delivery in rural areas
- No system exists to intelligently search through archives of scanned documents

#### For Students & Educational Institutions
- College circulars, mark sheets, certificates, and forms need to be organized
- Deadlines, eligibility criteria, and required documents are buried in PDFs
- No way to compare notices across years or ask follow-up questions

### 2.3 The Status Quo Is Broken

Current solutions — Adobe Acrobat, Google Drive OCR, Microsoft Lens — solve only the basic OCR problem. They do not:

- Understand Indian-specific document structures
- Speak Hindi
- Extract structured information from unstructured government notices
- Allow a user to have a conversation with their document stack
- Provide citations for answers they give

---

## 3. Vision & Mission

### Vision

To become the operating system for Indian documents — the intelligent layer that sits between every Indian citizen and their paperwork, transforming inaccessible, unstructured documents into actionable, queryable, and understandable information.

### Mission

Empower every Indian — regardless of literacy level, language preference, or technical sophistication — to understand, organize, and act on their documents by combining the best of AI, OCR, and multilingual intelligence.

### Core Values

- **Sarvabhasha:** All languages are equal. Hindi and English are first-class citizens.
- **Vishwas:** Trust is earned through transparency, accuracy, and clear confidence scoring.
- **Suraksha:** User documents are private, secure, and never used for training without consent.
- **Sahajata:** Ease of use above all else. A farmer should be able to use this, not just a developer.

---

## 4. Market Opportunity

### 4.1 Total Addressable Market (TAM)

| Segment | Market Size (INR) | Market Size (USD) |
|---|---|---|
| Document Management Software (India) | Rs. 12,000 Cr | ~$1.5B |
| AI/OCR Services (India) | Rs. 8,500 Cr | ~$1B |
| Legal Tech (India) | Rs. 6,200 Cr | ~$750M |
| Ed-Tech Document Services | Rs. 3,000 Cr | ~$360M |
| **Total TAM** | **~Rs. 29,700 Cr** | **~$3.6B** |

### 4.2 Serviceable Addressable Market (SAM)

Focusing on digitally active users in Tier 1 and Tier 2 cities, the SAM is estimated at:
- **~$400M** in the first 3 years
- Growing at ~35% CAGR as digital literacy and smartphone penetration increases

### 4.3 Serviceable Obtainable Market (SOM)

Year 3 target: **$15-25M ARR**
- B2C: 500,000 active users on freemium/paid tiers
- B2B: 300 enterprise/institutional accounts
- B2G: 10 government agency pilot programs

### 4.4 Competitive Landscape

| Competitor | Focus Area | Gap |
|---|---|---|
| Adobe Acrobat | PDF editing, OCR | No Hindi, no AI chat, expensive |
| Nanonets | Form extraction | English-only, no chat interface |
| Docsumo | Invoice automation | No Hindi, narrow document types |
| Google Document AI | General OCR | No Hindi-specific models, no chat |
| IndiaFilings | Legal compliance | Manual, no AI |
| DigiLocker | Identity document storage | Storage only, no intelligence |

**Whitespace:** No product exists that combines Hindi-first OCR, multilingual conversational AI, structured extraction, and document versioning for Indian documents at an affordable price point.

---

## 5. Target Users & Personas

### Persona 1: Priya — The College Student

- **Age:** 20
- **Location:** Patna, Bihar
- **Tech literacy:** Moderate (uses WhatsApp, YouTube)
- **Primary language:** Hindi + some English
- **Pain:** Receives scholarship circulars from her college/state government, often misses deadlines because she doesn't fully understand the dense Hindi notices
- **Goal:** Understand eligibility, find out the deadline, know what documents to submit
- **Value from DocSaarthi:** Upload the notice → Ask "mujhe kya document chahiye?" → Get a clear, cited answer in Hindi

### Persona 2: Ramesh — The Small Business Owner

- **Age:** 45
- **Location:** Surat, Gujarat
- **Tech literacy:** Low-moderate
- **Primary language:** Hindi + Gujarati (but documents in English/Hindi)
- **Pain:** Receives GST notices, invoices from vendors, and bank statements. Struggles to reconcile, track, and understand them.
- **Goal:** Find specific amounts, dates, and vendor names across dozens of documents
- **Value from DocSaarthi:** Upload all invoices → Query about total GST → Get a structured answer

### Persona 3: Kavitha — The HR Manager

- **Age:** 32
- **Location:** Bengaluru
- **Tech literacy:** High
- **Primary language:** English (documents in English/Hindi mix)
- **Pain:** Processes 500+ employment contracts, offer letters, and appraisal documents quarterly. Manual extraction is time-consuming.
- **Goal:** Extract structured information from employment documents at scale
- **Value from DocSaarthi:** Bulk upload → Auto-extract fields → Export to spreadsheet → Query across all employee docs

### Persona 4: Suresh — The Government Social Worker

- **Age:** 38
- **Location:** Raipur, Chhattisgarh
- **Tech literacy:** Moderate
- **Primary language:** Hindi
- **Pain:** Processes beneficiary documents for welfare schemes — ration cards, income certificates, caste certificates — manually. Errors are common, delays are chronic.
- **Goal:** Quickly verify a citizen's documents, extract key fields, confirm eligibility
- **Value from DocSaarthi:** Upload scanned certificate → Auto-extract name, date, authority → Verify → Flag anomalies

### Persona 5: Arjun — The Legal Researcher

- **Age:** 27
- **Location:** New Delhi
- **Tech literacy:** High
- **Primary language:** English + legal Hindi
- **Pain:** Researches legal notices, court orders, and government gazette documents. Needs to find specific clauses, compare versions of regulations.
- **Goal:** Compare two versions of a regulatory document, find all mentions of a specific section number
- **Value from DocSaarthi:** Upload v1 and v2 of a regulation → Compare → Ask "What changed in Section 4?"

---

## 6. User Journey & Stories

### 6.1 Primary User Journey: Document Understanding

```
1. User registers on DocSaarthi
2. User uploads a scanned Hindi government notice (PDF or image)
3. System immediately acknowledges: "Document received, processing..."
4. Background pipeline runs:
   - File validation -> storage -> OCR -> language detection
   - Classification: "Government Notice" (confidence 94%)
   - Structured extraction: title, issuing authority, deadline, eligibility
   - Confidence scoring: deadline confidence 87% (HIGH), eligibility 61% (MEDIUM)
   - Chunking + embedding -> indexed in pgvector
5. User sees document dashboard with extracted fields highlighted
6. Low-confidence fields shown with yellow highlight and "Verify" prompt
7. User clicks "Chat" -> asks "Is notice ki antim tarikh kya hai?"
8. System retrieves relevant chunks, generates answer with citation:
   "Antim tarikh 20 August 2026 hai. [Source: Page 2, Section: Important Dates]"
9. User clicks citation -> viewer jumps to page 2, highlights the relevant text
10. User asks "What documents do I need?" -> System answers in English
11. User accepts the extracted deadline field -> marked as human-verified
```

### 6.2 User Stories

#### Authentication & Onboarding

| ID | As a... | I want to... | So that... | Priority |
|---|---|---|---|---|
| US-001 | New user | Register with email and password | I can access the platform | P0 |
| US-002 | New user | Register with Google OAuth | I can onboard quickly | P1 |
| US-003 | Registered user | Log in securely | I can access my documents | P0 |
| US-004 | Logged-in user | Stay logged in with refresh tokens | I don't have to re-login constantly | P0 |
| US-005 | User | Reset my password via email | I can recover my account | P1 |
| US-006 | Admin | Manage organization members | I can give/revoke access | P1 |

#### Document Management

| ID | As a... | I want to... | So that... | Priority |
|---|---|---|---|---|
| US-010 | User | Upload a PDF or image | The system can process it | P0 |
| US-011 | User | See the upload status in real-time | I know when processing is done | P0 |
| US-012 | User | Upload multiple documents at once | I can batch-process files | P1 |
| US-013 | User | View all my documents in a dashboard | I can manage my collection | P0 |
| US-014 | User | Delete a document | I can clean up my data | P1 |
| US-015 | User | Upload a new version of an existing document | The system tracks changes | P1 |
| US-016 | User | See document processing history | I know every stage of processing | P2 |

#### Document Intelligence

| ID | As a... | I want to... | So that... | Priority |
|---|---|---|---|---|
| US-020 | User | See auto-classified document categories | I don't have to manually sort | P0 |
| US-021 | User | See extracted key fields | I can quickly understand the document | P0 |
| US-022 | User | See confidence scores for each field | I know what to verify | P0 |
| US-023 | User | Correct a wrong classification | The system improves and I track corrections | P1 |
| US-024 | User | Verify, edit, or reject extracted fields | I can ensure accuracy | P0 |
| US-025 | User | See which page a field came from | I can trust and verify the extraction | P0 |

#### Conversational AI

| ID | As a... | I want to... | So that... | Priority |
|---|---|---|---|---|
| US-030 | User | Ask questions about a document in Hindi | I can use my preferred language | P0 |
| US-031 | User | Ask questions in English | Non-Hindi users can also benefit | P0 |
| US-032 | User | Ask questions in Hinglish | The system handles natural language | P1 |
| US-033 | User | Get cited answers pointing to pages | I can verify the AI's response | P0 |
| US-034 | User | Click a citation to jump to the source | I can see the exact text | P0 |
| US-035 | User | Ask follow-up questions in a conversation | The system maintains context | P1 |
| US-036 | User | Ask questions across multiple documents | I can synthesize information | P1 |
| US-037 | User | Search all my documents | I can find information across my library | P0 |

#### Document Comparison

| ID | As a... | I want to... | So that... | Priority |
|---|---|---|---|---|
| US-040 | User | Compare two versions of a document | I can see what changed | P1 |
| US-041 | User | See field-level differences highlighted | I can quickly spot changes in key fields | P1 |
| US-042 | User | See page-by-page text differences | I can review changes in detail | P2 |
| US-043 | User | Get a semantic summary of changes | I can understand the impact of changes | P2 |

#### Human-in-the-Loop (HITL)

| ID | As a... | I want to... | So that... | Priority |
|---|---|---|---|---|
| US-050 | User | See a review queue of low-confidence fields | I can prioritize what to verify | P0 |
| US-051 | User | Inline-edit an extracted field value | I can correct mistakes quickly | P0 |
| US-052 | User | Reject a field entirely | The system doesn't use bad data | P1 |
| US-053 | User | See my correction history | I can audit what I've changed | P2 |

---

## 7. Core Product Features

### 7.1 Feature: Document Upload & Management

**Description:**
Users can upload documents via drag-and-drop or file picker. The system validates files server-side (not trusting client MIME types), generates secure storage keys, and immediately queues the document for async processing.

**Acceptance Criteria:**
- Supported formats: PDF, PNG, JPG, JPEG, WEBP
- Max file size: 50MB per file (configurable)
- Max pages per document: 100 (configurable)
- File validation rejects corrupted files, unsupported formats, and malicious file names
- Upload response is < 500ms (async: no OCR during upload)
- Upload status is shown in real-time via polling or WebSocket
- Documents are stored in object storage (MinIO locally, S3 in production)
- Storage keys follow the pattern: `{user_id}/{document_id}/{version_id}/{filename}`

---

### 7.2 Feature: Async Processing Pipeline

**Description:**
After upload, documents go through a 15-stage asynchronous pipeline managed by BullMQ workers. Each stage updates the document status and logs processing metadata.

**Pipeline Stages:**

| # | Stage | Description |
|---|---|---|
| 1 | FILE_VALIDATION | Re-validate file integrity, type, size |
| 2 | FILE_STORAGE | Confirm object storage write, generate CDN URL |
| 3 | PDF_RENDERING | Convert PDF pages to images (for OCR) |
| 4 | IMAGE_PREPROCESSING | Deskew, denoise, enhance contrast |
| 5 | OCR | Run OCR provider, extract text + bounding boxes |
| 6 | LANGUAGE_DETECTION | Detect language per block, page, document |
| 7 | DOCUMENT_CLASSIFICATION | Classify document type using LLM |
| 8 | TEXT_NORMALIZATION | Clean OCR artifacts, normalize encoding |
| 9 | STRUCTURED_EXTRACTION | Extract schema-based fields using LLM tool-calling |
| 10 | CONFIDENCE_SCORING | Score each field and overall document |
| 11 | VALIDATION | Cross-validate extracted fields |
| 12 | CHUNKING | Split text into semantic chunks |
| 13 | EMBEDDING | Generate vector embeddings per chunk |
| 14 | INDEXING | Write to pgvector, build full-text indexes |
| 15 | COMPLETED | Mark document as ready, notify user |

---

### 7.3 Feature: OCR Engine

**OCR Output Schema per Block:**
```json
{
  "page": 1,
  "blocks": [
    {
      "id": "block_uuid",
      "text": "aavedan ki antim tithi 20 agast 2026 hai.",
      "bbox": [120, 340, 890, 380],
      "confidence": 0.94,
      "language": "hi",
      "reading_order": 3,
      "block_type": "paragraph"
    }
  ],
  "page_language": "hi",
  "page_confidence": 0.91
}
```

**Confidence-Based Fallback:**
- If block confidence < 0.7: route to VLM fallback
- Store: ocr_provider, fallback_used, fallback_provider, original_confidence, final_confidence

---

### 7.4 Feature: Document Classification

**Categories:**
- Government Notice, Invoice, Receipt, Certificate, College Document
- Bank Document, Legal Document, Employment Document, Form, Letter
- Identity Document, Medical Document, Insurance Document, Tax Document, Unknown

**User Override:**
- User can change the classification
- Override is recorded in `classification_corrections` table with optional reason

---

### 7.5 Feature: Structured Information Extraction

**Extraction Schemas by Category:**

Government Notice: title, issuing_authority, notice_number, issue_date, effective_date, deadline, eligibility, required_documents, contact_information

Invoice: invoice_number, vendor_name, vendor_gstin, invoice_date, due_date, subtotal, tax_amount, total_amount, currency, items

Certificate: holder_name, certificate_type, issue_date, expiry_date, issuing_authority, certificate_number

Employment Document: employee_name, employer_name, designation, joining_date, ctc, department, employee_id

All extracted fields stored with: `value`, `confidence`, `source_page`, `source_bbox`, `extraction_method`, `verified` (bool).

---

### 7.6 Feature: Confidence Scoring & HITL Verification

**Confidence Thresholds:**

| Level | Score Range | UI Treatment |
|---|---|---|
| HIGH | 0.85 - 1.00 | Green badge, auto-accepted |
| MEDIUM | 0.65 - 0.84 | Yellow badge, shown for info |
| LOW | 0.00 - 0.64 | Red badge, flagged for review |

**HITL Actions:**
- ACCEPT: User confirms field value
- EDIT: User modifies value and saves
- REJECT: User removes field entirely
- All actions logged in `verification_events` table

---

### 7.7 Feature: Semantic Search & Hybrid Search

**Hybrid Scoring:**
```
final_score = (semantic_score * alpha) + (keyword_score * beta)
where alpha + beta = 1.0, default: alpha = 0.6, beta = 0.4
```

**Search Filters:** Category, Language, Date range, Confidence level, Processing status, Tags

---

### 7.8 Feature: RAG-Powered Conversational AI

**Conversation Features:**
- Multi-turn context maintained per conversation
- Language auto-detection and response in same language
- Hinglish support
- Citation generation with page and section references
- Refusal if information is not in documents: "I could not find this in your documents."
- Streaming response support
- System prompt strategy: Only top-k relevant chunks injected as context; never full document

---

### 7.9 Feature: Document Versioning & Comparison

**Comparison Types:**
1. **Field-Level Diff:** Compare extracted structured fields side by side
2. **Text Diff (Page-by-Page):** Word-level diff of OCR output per page
3. **Semantic Diff:** Use embeddings to identify semantically significant changes

---

### 7.10 Feature: Document Viewer

**Viewer Features:**
- Page navigation, zoom in/out
- OCR overlay toggle (show/hide extracted text bounding boxes)
- Confidence-colored overlays (green = high, yellow = medium, red = low)
- Inline editing of extracted fields from the right panel
- Download original document
- Two-panel layout: document on left, extracted info on right

---

### 7.11 Feature: Dashboard & Analytics

**Dashboard Widgets:**
- Total documents (with status breakdown)
- Documents needing review (low confidence)
- Recent uploads (last 7 days)
- Documents by category (pie chart)
- Processing success rate
- Upcoming deadlines extracted from documents
- Storage usage

---

### 7.12 Feature: Audit Logging

**Logged Events:**
- User authentication events
- Document lifecycle events (upload, process, delete, share)
- HITL events (field accepted, edited, rejected)
- Classification override events
- Conversation events (query, response)
- Settings changes, API key usage

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Metric | Target |
|---|---|
| Upload API response time | < 500ms (p95) |
| Document processing (1-page image) | < 30 seconds |
| Document processing (5-page PDF) | < 90 seconds |
| Chat response first token | < 2 seconds |
| Search query response | < 300ms (p95) |
| Dashboard load time | < 1.5 seconds |
| Vector search (1M embeddings) | < 100ms |

### 8.2 Availability

| Target | Metric |
|---|---|
| API availability | 99.9% uptime |
| Worker availability | 99.5% uptime |
| Object storage | 99.99% durability |

### 8.3 Scalability

- API server: horizontally scalable, stateless
- Worker: horizontally scalable, concurrency configurable
- Queue: Redis Cluster support
- Database: Read replicas for search queries
- pgvector scales to 100M+ rows with IVFFLAT/HNSW indexes

### 8.4 Reliability

- All background jobs: idempotent
- Retries: exponential backoff with jitter
- Dead-letter queue for failed jobs
- Circuit breaker for external AI providers
- Graceful degradation when AI provider is unavailable

---

## 9. AI & Intelligence Requirements

### 9.1 OCR Requirements

- Primary provider: PaddleOCR with Devanagari model
- Handwriting fallback: VLM for regions with confidence < 0.7
- Accuracy targets: > 90% character accuracy for printed Hindi text; > 75% for handwritten Hindi

### 9.2 LLM Requirements

- Provider abstraction (OpenAI / Gemini / Anthropic / local)
- Must support: tool calling, structured JSON output, streaming
- Must be multilingual: Hindi + English in same prompt/response
- Hard guardrail: no hallucination outside retrieved context

### 9.3 Embedding Requirements

- Provider abstraction
- Multilingual embeddings (Hindi + English in same vector space)
- Recommended: text-embedding-3-small or paraphrase-multilingual-MiniLM-L12-v2
- Stored in pgvector `vector(1536)` column
- Indexed with HNSW for approximate nearest neighbor search

### 9.4 Retrieval Requirements

- Top-k retrieval: configurable (default k=10)
- Re-ranking: cross-encoder re-ranking of top-k results
- Hybrid: semantic + BM25/full-text combination
- Context window management: prevent exceeding LLM context limits

---

## 10. Multilingual Requirements

### 10.1 Supported Languages

| Language | Script | Support Level |
|---|---|---|
| Hindi | Devanagari | Full (OCR, extraction, chat, search) |
| English | Latin | Full |
| Hinglish (mixed) | Latin | Full (query processing) |
| Bengali | Bengali script | Partial (future) |
| Tamil | Tamil script | Partial (future) |
| Marathi | Devanagari | Partial (same OCR model as Hindi) |

### 10.2 Language Detection

- Block-level, page-level, document-level
- Stored in database per entity
- Used to select appropriate prompt templates and response language

### 10.3 Devanagari Text Handling

- Database: UTF-8 encoding throughout (PostgreSQL)
- Full-text search: Hindi language dictionary for PostgreSQL tsvector
- Embeddings: multilingual model that supports Devanagari

---

## 11. Security & Compliance

### 11.1 Authentication Security

- Argon2id for password hashing
- Access tokens: JWT, 15-minute expiry
- Refresh tokens: opaque random tokens, 7-day expiry, stored hashed in DB
- HTTP-only, Secure, SameSite=Strict cookies
- Token rotation on every refresh

### 11.2 Authorization

- Role-based access control (RBAC): admin, member, viewer
- Row-level security: users can only access their own data
- Organization-level isolation

### 11.3 Data Security

- All data encrypted at rest and in transit (TLS 1.3)
- Presigned URLs for object storage (time-limited, < 1 hour expiry)
- Document content never logged in plaintext

### 11.4 Rate Limiting

| Endpoint | Limit |
|---|---|
| Upload | 10 uploads / minute / user |
| Chat query | 30 queries / minute / user |
| Search | 60 requests / minute / user |
| Authentication | 5 attempts / 15 minutes / IP |

### 11.5 Input Validation

- All inputs validated with Zod schemas
- File uploads: server-side MIME type detection (magic bytes)
- SQL injection: prevented via Prisma parameterized queries
- XSS: strict Content Security Policy headers
- File name sanitization: slugify + UUID prefix

### 11.6 Compliance

- GDPR-style data deletion: full data purge on account deletion request
- Data residency: deployable in India (AWS Mumbai region)
- Document confidentiality: documents never shared with other users
- AI training opt-out: user documents not used for AI model training by default

---

## 12. Monetization Strategy

### 12.1 Pricing Tiers

#### Free Tier (Pathik)
- 10 documents per month, 5 MB max file size
- 50 chat queries per month, 1 conversation per document
- No versioning, Community support

#### Pro Tier (Sahayak) — Rs. 299/month
- 200 documents per month, 50 MB max file size
- Unlimited chat queries, document versioning (3 versions)
- Document comparison, Priority processing, Email support

#### Business Tier (Vriddhi) — Rs. 1,499/month per seat
- Unlimited documents, 100 MB max file size
- All Pro features + unlimited document versions
- API access, Webhooks, Team collaboration (up to 10 seats)
- SSO, Priority support with SLA, Custom document schemas

#### Enterprise — Custom Pricing
- On-premise deployment, custom model fine-tuning
- HRMS/ERP integration, dedicated infrastructure, 24/7 support

---

## 13. Go-to-Market Strategy

### 13.1 Phase 1: Private Beta (Months 1-3)
- Target: 500 early adopters from waitlist
- Focus: Students and individual users
- Goal: Product-market fit validation, NPS > 40

### 13.2 Phase 2: Public Launch (Months 4-6)
- Target: 10,000 registered users, 500 paying
- Focus: B2C (students, SMBs)
- Channels: Google Ads (Hindi keywords), YouTube tutorials, WhatsApp groups
- Goal: Rs. 5 Lakh MRR

### 13.3 Phase 3: B2B Expansion (Months 7-12)
- Target: 50 B2B accounts, 300 B2C paying subscribers
- Focus: HR teams, accounting firms, legal researchers
- Goal: Rs. 30 Lakh MRR

### 13.4 Phase 4: Government & Enterprise (Year 2)
- Target: 3 government pilot programs, 15 enterprise accounts
- Goal: Rs. 1 Cr MRR

---

## 14. Success Metrics & KPIs

### 14.1 Product Health Metrics

| Metric | Month 3 Target | Month 12 Target |
|---|---|---|
| Monthly Active Users (MAU) | 1,000 | 25,000 |
| Documents processed | 5,000/month | 200,000/month |
| OCR accuracy (Hindi printed) | > 88% | > 93% |
| Extraction accuracy | > 80% | > 88% |
| User-accepted fields (no edit) | > 70% | > 80% |
| Avg. chat queries per active user | > 5/month | > 15/month |
| Chat answer citation rate | > 90% | > 95% |

### 14.2 Business Metrics

| Metric | Month 6 Target | Month 12 Target |
|---|---|---|
| MRR | Rs. 5 Lakh | Rs. 30 Lakh |
| Paying customers | 200 | 1,500 |
| Conversion rate (free to paid) | > 5% | > 8% |
| Monthly churn | < 5% | < 3% |
| NPS | > 40 | > 55 |

### 14.3 Technical Metrics

| Metric | Target |
|---|---|
| API P95 latency | < 500ms |
| Processing pipeline P95 latency | < 90s for 5-page PDF |
| System uptime | 99.9% |
| Failed job rate | < 1% |
| Vector search latency | < 100ms |

---

## 15. Roadmap

### Q4 2026: Foundation (MVP)
- Core authentication (register, login, refresh token)
- Document upload (PDF, PNG, JPG)
- Async processing pipeline (all 15 stages)
- PaddleOCR integration for Hindi + English
- Document classification (15 categories)
- Structured extraction (5 document types)
- Confidence scoring and HITL verification UI
- Document viewer (split panel)
- Basic RAG chat (per document)
- pgvector semantic search
- Dashboard with document list
- Docker Compose for local development

### Q1 2027: Intelligence & Search
- Hybrid search (semantic + full-text)
- Multi-document chat and search
- Hindi/Hinglish query support
- Citation-aware answers with click-to-source
- Document versioning
- Document comparison (field-level + text diff)
- VLM fallback for handwriting
- Tool-calling agent with all defined tools
- Rate limiting and caching layer
- Audit logging

### Q2 2027: Platform & Collaboration
- Organization management (multi-tenant)
- Team collaboration
- Google OAuth
- API access for B2B
- Webhooks, Bulk upload
- Export to CSV/JSON
- Email notifications

### Q3 2027: Enterprise & Scale
- SSO (SAML/Google Workspace)
- Custom document schemas
- Fine-tuned classification model for Indian docs
- Bengali, Tamil, Marathi support
- On-premise deployment kit
- HRMS/ERP integration APIs

---

## 16. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| OCR accuracy insufficient for real Indian govt docs | Medium | High | Multiple OCR providers, VLM fallback, user HITL correction |
| LLM hallucination in chat answers | High | High | Hard RAG constraints, refusal prompts, citation enforcement |
| AI provider outage | Medium | High | Provider abstraction, fallback chain, circuit breakers |
| User data breach | Low | Critical | Encryption at rest/transit, presigned URLs, no plaintext logging |
| Devanagari search quality poor | Medium | Medium | Hindi-specific tsvector config, multilingual embeddings |
| High processing costs at scale | Medium | High | Caching, OCR cost per page controls, tier-based processing priority |
| Legal compliance (data residency) | Low | Medium | India-region deployable, GDPR-compliant deletion, opt-out |
| Competitor entry (Adobe, Google) | Medium | Medium | Focus on Hindi-first, India-specific doc types, pricing |

---

## 17. Appendix

### A. Supported Indian Document Types

| Document Type | Common Languages | Key Fields |
|---|---|---|
| Scholarship Notice | Hindi, English | Eligibility, deadline, required documents |
| Government Circular | Hindi | Issuing authority, subject, effective date |
| GST Invoice | English/Hindi | GSTIN, invoice no., amount, items |
| Mark Sheet | English/Hindi | Student name, institution, marks, grade |
| Degree Certificate | English | Name, degree, year, authority |
| Income Certificate | Hindi | Name, income, issuing authority |
| Caste Certificate | Hindi | Name, caste, authority, date |
| Employment Letter | English | Name, CTC, designation, date |
| Bank Statement | English | Account no., transactions, balance |
| Rent Agreement | Hindi/English | Parties, property, amount, tenure |
| Legal Notice | English/Hindi | Sender, recipient, cause of action |

### B. Glossary

| Term | Meaning |
|---|---|
| OCR | Optical Character Recognition |
| VLM | Vision Language Model |
| RAG | Retrieval Augmented Generation |
| HITL | Human-in-the-Loop |
| pgvector | PostgreSQL extension for vector similarity search |
| BullMQ | Redis-based job queue library for Node.js |
| HNSW | Hierarchical Navigable Small World (vector index algorithm) |
| Hinglish | Mixed Hindi-English as spoken in urban India |
| Devanagari | Script used for Hindi, Marathi, Sanskrit |
| tsvector | PostgreSQL full-text search data type |

### C. Regulatory Considerations

- **IT Act 2000:** Data localization and cybersecurity compliance
- **PDPB (Personal Data Protection Bill):** User consent for data processing
- **GST:** Invoice-related documents must preserve original fidelity
- **DigiLocker API:** Future integration for document verification

---

*This document is confidential and intended for the DocSaarthi founding team and authorized investors only.*
*Last updated: August 2026*
