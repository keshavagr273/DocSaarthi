# DocSaarthi — AI Agents Design Document

> **Version:** 1.0.0
> **Date:** August 2026
> **Audience:** AI Engineering Team
> **Status:** Design Specification

---

## Table of Contents

1. [Agents Overview](#1-agents-overview)
2. [Agent Design Philosophy](#2-agent-design-philosophy)
3. [DocumentAgent — Main Conversational Agent](#3-documentagent--main-conversational-agent)
4. [Tools Specification](#4-tools-specification)
5. [ProcessingAgent — Document Intelligence Agent](#5-processingagent--document-intelligence-agent)
6. [ClassificationAgent](#6-classificationagent)
7. [ExtractionAgent](#7-extractionagent)
8. [OCROrchestrator — Intelligent OCR Agent](#8-ocrorchestrator--intelligent-ocr-agent)
9. [SearchAgent — Hybrid Search Agent](#9-searchagent--hybrid-search-agent)
10. [ComparisonAgent — Document Diff Agent](#10-comparisonagent--document-diff-agent)
11. [LanguageAgent — Multilingual Processing Agent](#11-languageagent--multilingual-processing-agent)
12. [Agent Orchestration & Communication](#12-agent-orchestration--communication)
13. [Prompt Engineering Guide](#13-prompt-engineering-guide)
14. [Safety & Guardrails](#14-safety--guardrails)
15. [Agent Observability](#15-agent-observability)
16. [Agent Testing Strategy](#16-agent-testing-strategy)
17. [Multi-Provider Failover Strategy](#17-multi-provider-failover-strategy)
18. [Appendix: Full Prompt Library](#18-appendix-full-prompt-library)

---

## 1. Agents Overview

DocSaarthi uses a collection of purpose-built AI agents, each responsible for a specific intelligence task. These agents communicate through structured interfaces, share context through a common pipeline, and are designed to be independently testable and replaceable.

### Agent Map

```
                    ┌─────────────────────────────────────┐
                    │         USER INTERACTION             │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │          DocumentAgent               │
                    │   (Main conversational interface)    │
                    │   - Multi-turn conversation          │
                    │   - Tool orchestration               │
                    │   - Citation generation              │
                    └──┬──────────┬──────────┬────────────┘
                       │          │          │
           ┌───────────▼──┐  ┌────▼────┐  ┌─▼──────────────┐
           │ SearchAgent  │  │   DB    │  │  DocumentAgent  │
           │ (hybrid RAG) │  │  Tools  │  │   Sub-tools     │
           └───────────┬──┘  └────┬────┘  └────────────────┘
                       │          │
                    ┌──▼──────────▼──────────────────────┐
                    │        pgvector + PostgreSQL         │
                    └────────────────────────────────────┘

  DOCUMENT PROCESSING PIPELINE AGENTS:

  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  LanguageAgent → ClassificationAgent → ExtractionAgent         │
  │       ↑                                       ↑                │
  │  OCROrchestrator                        ComparisonAgent        │
  │       ↑                                                         │
  │  [PaddleOCR / VLM Fallback]                                    │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

### Agent Inventory

| Agent | Purpose | LLM Required | Tools | Type |
|---|---|---|---|---|
| `DocumentAgent` | Conversational AI for user queries | Yes | 10 tools | Conversational |
| `ClassificationAgent` | Classify document category | Yes | None | Processing |
| `ExtractionAgent` | Extract structured fields from documents | Yes | Schema tools | Processing |
| `OCROrchestrator` | Intelligent OCR with fallback routing | Vision LLM | None | Processing |
| `LanguageAgent` | Detect and handle multilingual content | Yes | None | Processing |
| `SearchAgent` | Orchestrate hybrid search + reranking | Yes | Search tools | Retrieval |
| `ComparisonAgent` | Compare document versions semantically | Yes | Diff tools | Analysis |

---

## 2. Agent Design Philosophy

### 2.1 Core Principles

**1. Bounded Responsibility**

Each agent does ONE thing well. No agent combines document classification with extraction with chat. This makes agents independently testable, replaceable, and debuggable.

**2. Strict Context Grounding**

Every agent that generates text for end users MUST be grounded in retrieved context or database data. No agent is permitted to generate facts from parametric knowledge when answering document-specific questions.

```typescript
// WRONG: LLM uses its training data to answer
"What is the deadline for this scholarship?"
→ LLM: "Government scholarships typically have deadlines in August..."

// RIGHT: LLM uses retrieved context only
"What is the deadline for this scholarship?"
→ SearchAgent retrieves chunk: "अंतिम तारीख 20 अगस्त 2026"
→ DocumentAgent: "The deadline is 20 August 2026. [Source: Page 2]"
```

**3. Language Awareness**

Every agent must be aware of the language of its inputs and outputs. Processing agents receive language hints. The DocumentAgent detects query language and responds accordingly.

**4. Confidence-First Design**

Agents produce confidence scores alongside their outputs. Uncertain outputs are flagged for human review rather than silently accepted.

**5. Fail-Safe Defaults**

If an agent fails:
- Processing agents: mark stage as failed, store error, retry
- DocumentAgent: return graceful error message, never hallucinate

**6. Auditability**

Every agent call is logged with:
- Input (sanitized)
- Output
- Provider used
- Tokens consumed
- Latency
- Confidence scores

### 2.2 Agent Architecture Pattern

All agents follow this pattern:

```typescript
interface Agent<TInput, TOutput> {
  readonly name: string;
  readonly version: string;

  execute(input: TInput, context: AgentContext): Promise<TOutput>;
}

interface AgentContext {
  requestId: string;
  userId: string;
  documentId?: string;
  conversationId?: string;
  language?: SupportedLanguage;
  llmProvider?: string;
  traceId: string;
}

interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: AgentError;
  metadata: {
    agent: string;
    provider: string;
    model: string;
    tokensUsed: number;
    latencyMs: number;
    confidence?: number;
  };
}
```

---

## 3. DocumentAgent — Main Conversational Agent

### 3.1 Purpose

The DocumentAgent is the primary user-facing AI. It:
1. Receives natural language questions from users
2. Detects query language and intent
3. Selects and executes appropriate tools
4. Synthesizes an answer from tool results
5. Generates citations pointing to source pages
6. Responds in the same language as the query

### 3.2 Architecture

```
User Query
    │
    ▼
LanguageDetector.detect(query)
    │
    ▼
IntentClassifier (simple heuristic or LLM)
    │
    ├─── FACTUAL_QUESTION → RAG flow
    │
    ├─── STRUCTURED_QUERY → DB tool call
    │
    ├─── SUMMARIZATION → summarize_document tool
    │
    ├─── COMPARISON → compare_documents tool
    │
    └─── EXPLORATION → search_documents tool
    │
    ▼
Tool Execution Loop (max 5 iterations)
    │
    ▼
Context Assembly
    │
    ▼
LLM Answer Generation (streaming)
    │
    ▼
Citation Extraction
    │
    ▼
Response + Citations
```

### 3.3 Full Implementation

```typescript
// packages/ai/src/agents/document.agent.ts

@Injectable()
export class DocumentAgent implements Agent<DocumentAgentInput, DocumentAgentOutput> {
  readonly name = 'DocumentAgent';
  readonly version = '1.0.0';

  private readonly MAX_TOOL_ITERATIONS = 5;
  private readonly MAX_CONTEXT_TOKENS = 8000;

  constructor(
    private readonly llmFactory: LLMProviderFactory,
    private readonly toolRegistry: ToolRegistry,
    private readonly languageDetector: LanguageDetector,
    private readonly contextBuilder: ContextBuilder,
    private readonly citationExtractor: CitationExtractor,
    private readonly auditService: AgentAuditService,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: DocumentAgentInput,
    ctx: AgentContext
  ): Promise<AgentResult<DocumentAgentOutput>> {
    const startTime = Date.now();
    const llm = await this.llmFactory.getAvailableProvider();

    // 1. Detect language of user query
    const queryLanguage = await this.languageDetector.detectLanguage(input.query);

    // 2. Build conversation messages
    const messages = await this.buildInitialMessages(input, queryLanguage, ctx);

    // 3. Register all tools available to this agent
    const tools = this.getToolDefinitions(ctx);

    let iteration = 0;
    let toolCallHistory: ToolCall[] = [];
    let finalResponse: string | null = null;

    // 4. Tool execution loop (ReAct-style)
    while (iteration < this.MAX_TOOL_ITERATIONS) {
      iteration++;

      const response = await llm.complete({
        messages,
        tools,
        toolChoice: 'auto',
        temperature: 0.1,
        maxTokens: 2000,
      });

      // If model responds with text (no tool call) — we have our answer
      if (response.finishReason === 'stop' && response.content) {
        finalResponse = response.content;
        break;
      }

      // If model wants to call tools
      if (response.finishReason === 'tool_calls' && response.toolCalls) {
        // Add assistant message with tool calls to history
        messages.push({
          role: 'assistant',
          content: null,
          toolCalls: response.toolCalls,
        });

        // Execute each tool call
        for (const toolCall of response.toolCalls) {
          const toolResult = await this.executeToolCall(toolCall, ctx);
          toolCallHistory.push({ ...toolCall, result: toolResult });

          // Add tool result to messages
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }
      }

      if (iteration >= this.MAX_TOOL_ITERATIONS) {
        // Force a final answer without more tools
        messages.push({
          role: 'user',
          content: 'Please provide your final answer based on the information gathered so far.',
        });
        const forcedResponse = await llm.complete({ messages, temperature: 0.1, maxTokens: 2000 });
        finalResponse = forcedResponse.content;
        break;
      }
    }

    // 5. Extract citations from the response
    const citations = await this.citationExtractor.extract(
      finalResponse!,
      toolCallHistory,
      ctx
    );

    // 6. Ensure answer is grounded (safety check)
    const groundedAnswer = this.enforceGrounding(finalResponse!, toolCallHistory);

    // 7. Log agent execution
    await this.auditService.logAgentCall({
      agent: this.name,
      requestId: ctx.requestId,
      userId: ctx.userId,
      query: input.query,
      queryLanguage,
      toolCallCount: toolCallHistory.length,
      latencyMs: Date.now() - startTime,
      provider: llm.name,
    });

    return {
      success: true,
      data: {
        answer: groundedAnswer,
        language: queryLanguage,
        citations,
        toolCallCount: toolCallHistory.length,
      },
      metadata: {
        agent: this.name,
        provider: llm.name,
        model: llm.currentModel,
        tokensUsed: this.countTotalTokens(toolCallHistory),
        latencyMs: Date.now() - startTime,
      },
    };
  }

  private async buildInitialMessages(
    input: DocumentAgentInput,
    language: SupportedLanguage,
    ctx: AgentContext
  ): Promise<LLMMessage[]> {
    const systemPrompt = this.buildSystemPrompt(language, ctx);

    const conversationHistory = ctx.conversationId
      ? await this.getRecentConversationHistory(ctx.conversationId)
      : [];

    return [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: input.query },
    ];
  }

  private buildSystemPrompt(language: SupportedLanguage, ctx: AgentContext): string {
    const langInstruction = {
      hi: 'Always respond in Hindi (Devanagari script). For numbers and proper nouns, use the same form as found in the document.',
      en: 'Always respond in English.',
      hinglish: 'Respond naturally in Hinglish (mixed Hindi-English). Match the casual tone of the user.',
    }[language] ?? 'Respond in the same language as the user question.';

    const docScope = ctx.documentId
      ? `You are helping the user with ONE specific document (ID: ${ctx.documentId}).`
      : 'You are helping the user search and understand ALL their uploaded documents.';

    return `You are DocSaarthi, an intelligent document assistant specializing in Indian documents.
${docScope}

${langInstruction}

CRITICAL RULES — YOU MUST FOLLOW THESE EXACTLY:
1. ONLY answer based on information retrieved using your tools or provided in the context.
2. NEVER use your training knowledge to answer document-specific questions.
3. If you cannot find information in the documents, say: "${language === 'hi' ? 'मुझे यह जानकारी आपके दस्तावेज़ों में नहीं मिली।' : 'I could not find this information in your documents.'}"
4. ALWAYS cite your sources in format: [Source: Document Name, Page X, Section: Y]
5. Use tools to retrieve information before answering factual questions.
6. For structured queries (deadlines, amounts, dates), use get_extracted_fields or get_deadlines tools — they are more reliable than text search.
7. Be concise and direct. Do not repeat the question or add unnecessary preamble.
8. If you have partial information, share it with appropriate uncertainty.

Available document scope: ${ctx.documentId ? 'Single document' : 'All user documents'}
Current date: ${new Date().toLocaleDateString('en-IN')}`;
  }

  private enforceGrounding(answer: string, toolHistory: ToolCall[]): string {
    // If no tools were called, the answer cannot be grounded in documents
    if (toolHistory.length === 0) {
      // If answer contains factual claims, this is a hallucination risk
      const containsFacts = this.containsFactualClaims(answer);
      if (containsFacts) {
        this.logger.warn('DocumentAgent: Answer generated without tool calls — potential hallucination');
        // Return safe fallback
        return 'I need to search your documents to answer this question. Please try asking again.';
      }
    }
    return answer;
  }

  private getToolDefinitions(ctx: AgentContext): LLMTool[] {
    const baseTools = [
      ToolDefinitions.SEARCH_DOCUMENTS,
      ToolDefinitions.SEARCH_SEMANTIC,
      ToolDefinitions.GET_DOCUMENT,
      ToolDefinitions.GET_DOCUMENT_PAGE,
      ToolDefinitions.GET_EXTRACTED_FIELDS,
      ToolDefinitions.GET_DOCUMENT_METADATA,
      ToolDefinitions.LIST_USER_DOCUMENTS,
      ToolDefinitions.GET_DOCUMENTS_BY_CATEGORY,
      ToolDefinitions.GET_DEADLINES,
      ToolDefinitions.SUMMARIZE_DOCUMENT,
    ];

    // Add comparison tool only for multi-document context
    if (!ctx.documentId) {
      return [...baseTools, ToolDefinitions.COMPARE_DOCUMENTS];
    }

    return baseTools;
  }
}
```

### 3.4 Intent Classification

```typescript
// Simple heuristic intent classification (no LLM call needed)
@Injectable()
export class IntentClassifier {
  classify(query: string, language: SupportedLanguage): QueryIntent {
    const normalizedQuery = query.toLowerCase();

    // Structured query patterns
    const structuredPatterns = [
      /deadline/i, /due date/i, /last date/i,
      /antim tarikh/i, /अंतिम तारीख/,
      /total amount/i, /kitna paisa/i, /कुल राशि/,
      /how many/i, /kitne/i, /कितने/,
    ];

    // Comparison patterns
    const comparisonPatterns = [
      /compare/i, /difference/i, /changed/i,
      /tulna/i, /तुलना/, /kya badla/i, /क्या बदला/,
      /version 1.*version 2/i, /v1.*v2/i,
    ];

    // Summarization patterns
    const summarizationPatterns = [
      /summarize/i, /summary/i, /what is this/i,
      /yeh kya hai/i, /यह क्या है/, /batao/i,
      /samjhao/i, /समझाओ/,
    ];

    if (structuredPatterns.some(p => p.test(normalizedQuery))) {
      return QueryIntent.STRUCTURED_QUERY;
    }
    if (comparisonPatterns.some(p => p.test(normalizedQuery))) {
      return QueryIntent.COMPARISON;
    }
    if (summarizationPatterns.some(p => p.test(normalizedQuery))) {
      return QueryIntent.SUMMARIZATION;
    }

    return QueryIntent.FACTUAL_QUESTION;
  }
}

enum QueryIntent {
  FACTUAL_QUESTION = 'FACTUAL_QUESTION',
  STRUCTURED_QUERY = 'STRUCTURED_QUERY',
  SUMMARIZATION = 'SUMMARIZATION',
  COMPARISON = 'COMPARISON',
  EXPLORATION = 'EXPLORATION',
}
```

---

## 4. Tools Specification

All tools are implemented as NestJS services, registered with the `ToolRegistry`, and exposed to the DocumentAgent as JSON Schema tool definitions.

### Tool Design Rules

1. **Tools are pure functions** — same input always produces same database query (deterministic, not creative)
2. **Tools never call LLMs** — tools query databases or invoke structured services
3. **Tools return structured JSON** — not prose
4. **Tools enforce user scope** — EVERY tool filters by `userId` from context
5. **Tools have timeouts** — no tool executes for more than 10 seconds
6. **Tools are safe** — no arbitrary SQL, no file system access beyond presigned URLs

---

### Tool 1: `search_documents`

**Purpose:** Hybrid (semantic + keyword) search across user's documents.

**JSON Schema:**
```json
{
  "name": "search_documents",
  "description": "Search across all user documents using hybrid search (semantic + keyword). Use this for most natural language queries about document content. Returns ranked document chunks with source information.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query in any language (Hindi, English, or Hinglish)"
      },
      "document_id": {
        "type": "string",
        "description": "Optional: If provided, search only within this specific document"
      },
      "category": {
        "type": "string",
        "enum": ["GOVERNMENT_NOTICE", "INVOICE", "RECEIPT", "CERTIFICATE", "COLLEGE_DOCUMENT", "BANK_DOCUMENT", "LEGAL_DOCUMENT", "EMPLOYMENT_DOCUMENT", "FORM", "LETTER"],
        "description": "Optional: Filter results to documents of this category"
      },
      "limit": {
        "type": "integer",
        "description": "Number of results to return (default: 5, max: 10)",
        "default": 5
      }
    },
    "required": ["query"]
  }
}
```

**Implementation:**
```typescript
@Injectable()
export class SearchDocumentsTool implements Tool {
  readonly name = 'search_documents';

  async execute(
    params: SearchDocumentsParams,
    ctx: AgentContext
  ): Promise<SearchDocumentsResult> {
    const results = await this.hybridSearchService.search(params.query, {
      userId: ctx.userId,                    // ALWAYS scope to user
      documentId: params.document_id,
      category: params.category,
      limit: Math.min(params.limit ?? 5, 10), // Cap at 10
      semanticWeight: 0.6,
      keywordWeight: 0.4,
    });

    return {
      results: results.map(r => ({
        chunk_id: r.chunkId,
        document_id: r.documentId,
        document_title: r.documentTitle,
        document_category: r.category,
        page_number: r.pageNumber,
        section_title: r.sectionTitle,
        content: r.content.slice(0, 500), // Limit content size
        relevance_score: r.finalScore,
      })),
      total_results: results.length,
    };
  }
}
```

---

### Tool 2: `search_semantic`

**Purpose:** Pure semantic/vector search — for conceptual/abstract queries where keyword matching won't help.

```json
{
  "name": "search_semantic",
  "description": "Semantic similarity search using vector embeddings. Best for conceptual queries like 'find sections about eligibility criteria' or 'what parts discuss financial requirements'. Use when keyword search might miss relevant content.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "document_id": { "type": "string" },
      "min_similarity": { "type": "number", "default": 0.65 },
      "limit": { "type": "integer", "default": 5, "maximum": 10 }
    },
    "required": ["query"]
  }
}
```

---

### Tool 3: `get_document`

**Purpose:** Get document-level metadata and extracted fields.

```json
{
  "name": "get_document",
  "description": "Get complete information about a specific document including metadata, category, processing status, and all extracted structured fields. Use this when you need a full picture of a document.",
  "parameters": {
    "type": "object",
    "properties": {
      "document_id": { "type": "string", "description": "The document ID to retrieve" }
    },
    "required": ["document_id"]
  }
}
```

**Implementation:**
```typescript
async execute(params: { document_id: string }, ctx: AgentContext) {
  const document = await this.documentsService.findByIdForUser(
    params.document_id,
    ctx.userId  // CRITICAL: verify ownership
  );

  if (!document) {
    return { error: 'Document not found or access denied', document_id: params.document_id };
  }

  return {
    document_id: document.id,
    title: document.title,
    category: document.category,
    category_confidence: document.categoryConfidence,
    primary_language: document.primaryLanguage,
    page_count: document.currentVersion?.pageCount,
    upload_date: document.createdAt,
    status: document.status,
    extracted_fields: document.fields.map(f => ({
      field_name: f.fieldName,
      value: f.rawValue,
      confidence: f.confidence,
      confidence_level: f.confidenceLevel,
      source_page: f.sourcePage,
      is_verified: f.isVerified,
    })),
  };
}
```

---

### Tool 4: `get_document_page`

**Purpose:** Get the full OCR text of a specific page (for detailed reading).

```json
{
  "name": "get_document_page",
  "description": "Get the complete OCR text content of a specific page of a document. Use when you need to read a specific page in full detail rather than searching for keywords.",
  "parameters": {
    "type": "object",
    "properties": {
      "document_id": { "type": "string" },
      "page_number": { "type": "integer", "minimum": 1 }
    },
    "required": ["document_id", "page_number"]
  }
}
```

---

### Tool 5: `get_extracted_fields`

**Purpose:** Get only the structured extracted fields for a document. Faster than get_document for targeted field lookup.

```json
{
  "name": "get_extracted_fields",
  "description": "Get all structured extracted fields from a document (e.g., deadline, invoice number, holder name). More targeted than get_document when you only need specific field values. Always prefer this over text search for structured data like dates, amounts, names.",
  "parameters": {
    "type": "object",
    "properties": {
      "document_id": { "type": "string" },
      "field_names": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional: specific field names to retrieve (e.g., ['deadline', 'invoice_number']). If omitted, all fields returned."
      }
    },
    "required": ["document_id"]
  }
}
```

---

### Tool 6: `get_document_metadata`

**Purpose:** Get lightweight metadata without full content. Useful for listing and filtering.

```json
{
  "name": "get_document_metadata",
  "description": "Get lightweight metadata about a document: title, category, language, upload date, page count, overall confidence. Use for quick facts about a document without fetching full content.",
  "parameters": {
    "type": "object",
    "properties": {
      "document_id": { "type": "string" }
    },
    "required": ["document_id"]
  }
}
```

---

### Tool 7: `list_user_documents`

**Purpose:** List documents with filtering and sorting.

```json
{
  "name": "list_user_documents",
  "description": "List all documents uploaded by the user with optional filters. Use when the user asks questions like 'how many invoices did I upload?', 'show me all government notices', or 'what documents did I upload this month?'",
  "parameters": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "enum": ["GOVERNMENT_NOTICE", "INVOICE", "RECEIPT", "CERTIFICATE", "COLLEGE_DOCUMENT", "BANK_DOCUMENT", "LEGAL_DOCUMENT", "EMPLOYMENT_DOCUMENT", "FORM", "LETTER", "UNKNOWN"]
      },
      "status": {
        "type": "string",
        "enum": ["COMPLETED", "PROCESSING", "FAILED", "NEEDS_REVIEW"]
      },
      "language": {
        "type": "string",
        "enum": ["hi", "en", "hi+en"]
      },
      "uploaded_after": {
        "type": "string",
        "format": "date",
        "description": "ISO date string — only return documents uploaded after this date"
      },
      "uploaded_before": {
        "type": "string",
        "format": "date"
      },
      "limit": { "type": "integer", "default": 20, "maximum": 100 }
    },
    "required": []
  }
}
```

**Implementation:**
```typescript
async execute(params: ListDocumentsParams, ctx: AgentContext) {
  const documents = await this.documentsService.findAll({
    userId: ctx.userId,        // ALWAYS scope to user
    category: params.category,
    status: params.status,
    language: params.language,
    uploadedAfter: params.uploaded_after ? new Date(params.uploaded_after) : undefined,
    uploadedBefore: params.uploaded_before ? new Date(params.uploaded_before) : undefined,
    limit: Math.min(params.limit ?? 20, 100),
  });

  return {
    total: documents.total,
    documents: documents.items.map(d => ({
      document_id: d.id,
      title: d.title,
      category: d.category,
      language: d.primaryLanguage,
      upload_date: d.createdAt,
      status: d.status,
      page_count: d.currentVersion?.pageCount,
    })),
  };
}
```

---

### Tool 8: `get_documents_by_category`

**Purpose:** Specifically list documents of a certain type.

```json
{
  "name": "get_documents_by_category",
  "description": "Get all documents of a specific category. Use for category-specific queries like 'show all my invoices' or 'list my certificates'.",
  "parameters": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "enum": ["GOVERNMENT_NOTICE", "INVOICE", "RECEIPT", "CERTIFICATE", "COLLEGE_DOCUMENT", "BANK_DOCUMENT", "LEGAL_DOCUMENT", "EMPLOYMENT_DOCUMENT", "FORM", "LETTER"]
      },
      "limit": { "type": "integer", "default": 10, "maximum": 50 }
    },
    "required": ["category"]
  }
}
```

---

### Tool 9: `get_deadlines`

**Purpose:** Query PostgreSQL directly for deadline fields across all documents. Pure SQL, no vector search.

```json
{
  "name": "get_deadlines",
  "description": "Get all deadline/due dates extracted from user documents. Queries structured database fields directly for accurate date information. Use when user asks about upcoming deadlines, expiry dates, due dates, or any time-sensitive information across their documents.",
  "parameters": {
    "type": "object",
    "properties": {
      "document_category": {
        "type": "string",
        "description": "Optional: filter deadlines to a specific document category"
      },
      "upcoming_days": {
        "type": "integer",
        "description": "Optional: only show deadlines within the next N days (e.g., 30 for next month)",
        "default": 90
      },
      "include_past": {
        "type": "boolean",
        "description": "Include deadlines that have already passed",
        "default": false
      }
    },
    "required": []
  }
}
```

**Implementation:**
```typescript
async execute(params: GetDeadlinesParams, ctx: AgentContext) {
  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + (params.upcoming_days ?? 90));

  // DIRECT SQL QUERY — No LLM, no vector search
  const deadlineFields = await this.prisma.documentField.findMany({
    where: {
      document: {
        userId: ctx.userId,     // ALWAYS scope to user
        isDeleted: false,
        ...(params.document_category
          ? { category: params.document_category as DocumentCategory }
          : {}),
      },
      fieldName: {
        in: ['deadline', 'due_date', 'effective_date', 'expiry_date', 'last_date'],
      },
      isRejected: false,
    },
    include: {
      document: {
        select: { id: true, title: true, category: true },
      },
    },
  });

  const deadlines = deadlineFields
    .map(f => ({
      field_name: f.fieldName,
      value: f.rawValue,
      parsed_date: this.tryParseDate(f.rawValue),
      document_id: f.document.id,
      document_title: f.document.title,
      document_category: f.document.category,
      confidence: f.confidence,
      is_verified: f.isVerified,
    }))
    .filter(d => {
      if (!d.parsed_date) return true; // Include unparseable dates
      if (!params.include_past && d.parsed_date < now) return false;
      if (d.parsed_date > cutoffDate) return false;
      return true;
    })
    .sort((a, b) => {
      if (!a.parsed_date || !b.parsed_date) return 0;
      return a.parsed_date.getTime() - b.parsed_date.getTime();
    });

  return {
    total: deadlines.length,
    deadlines,
    query_date: now.toISOString(),
    looking_ahead_days: params.upcoming_days ?? 90,
  };
}
```

---

### Tool 10: `summarize_document`

**Purpose:** Generate a structured summary of a complete document.

```json
{
  "name": "summarize_document",
  "description": "Generate a comprehensive summary of a document. The summary includes: document type, key information, important dates, required actions, and main points. Use when user asks what a document is about or to get an overview.",
  "parameters": {
    "type": "object",
    "properties": {
      "document_id": { "type": "string" },
      "language": {
        "type": "string",
        "enum": ["hi", "en"],
        "description": "Language for the summary",
        "default": "en"
      },
      "detail_level": {
        "type": "string",
        "enum": ["brief", "standard", "detailed"],
        "default": "standard"
      }
    },
    "required": ["document_id"]
  }
}
```

**Implementation:**
```typescript
async execute(params: SummarizeDocumentParams, ctx: AgentContext) {
  // Verify ownership
  const document = await this.documentsService.findByIdForUser(
    params.document_id,
    ctx.userId
  );
  if (!document) throw new ForbiddenException();

  // Get top chunks (first 3 pages worth of content)
  const chunks = await this.chunksService.getTopChunks(
    params.document_id,
    { limit: 15 }
  );

  const fields = document.fields;

  // Use LLM to generate summary from chunks + fields
  const llm = await this.llmFactory.getAvailableProvider();

  const summaryPrompt = this.buildSummaryPrompt(
    document,
    chunks,
    fields,
    params.language ?? 'en',
    params.detail_level ?? 'standard'
  );

  const response = await llm.complete({
    messages: [{ role: 'user', content: summaryPrompt }],
    responseFormat: 'json_object',
    temperature: 0.2,
  });

  const summary = JSON.parse(response.content!);

  // Cache summary (invalidated on new version)
  await this.cache.set(
    `doc:${params.document_id}:summary:${params.language}`,
    summary,
    3600 // 1 hour
  );

  return summary;
}
```

### Tool 11: `compare_documents`

**Purpose:** Compare two document versions or two different documents.

```json
{
  "name": "compare_documents",
  "description": "Compare two documents or two versions of the same document. Returns field-level differences, key changes, and a semantic change summary. Use when user explicitly asks about differences between documents or versions.",
  "parameters": {
    "type": "object",
    "properties": {
      "document_id_1": { "type": "string" },
      "document_id_2": { "type": "string" },
      "version_id_1": { "type": "string", "description": "Optional specific version" },
      "version_id_2": { "type": "string", "description": "Optional specific version" },
      "comparison_type": {
        "type": "string",
        "enum": ["fields", "text", "semantic", "all"],
        "default": "all"
      }
    },
    "required": ["document_id_1", "document_id_2"]
  }
}
```

---

## 5. ProcessingAgent — Document Intelligence Agent

### 5.1 Purpose

The ProcessingAgent orchestrates the AI stages of the document pipeline. It is NOT a conversational agent — it processes documents during the background pipeline.

### 5.2 Role in Pipeline

```
Worker receives job: "process-document"
    │
    ▼
ProcessingAgent.orchestrate(versionId)
    │
    ├── Stage 5: calls OCROrchestrator
    ├── Stage 6: calls LanguageAgent
    ├── Stage 7: calls ClassificationAgent
    ├── Stage 9: calls ExtractionAgent
    └── Stage 10: calls ConfidenceScorer
```

### 5.3 ProcessingAgent Orchestration

```typescript
@Injectable()
export class ProcessingAgent {
  async orchestrate(context: ProcessingContext): Promise<ProcessingResult> {
    // Run stages sequentially, passing context through
    let ctx = context;

    try {
      // OCR
      ctx = await this.ocrOrchestrator.process(ctx);

      // Language detection
      ctx = await this.languageAgent.detect(ctx);

      // Classification
      ctx = await this.classificationAgent.classify(ctx);

      // Text normalization
      ctx = await this.textNormalizer.normalize(ctx);

      // Structured extraction (schema depends on classification result)
      ctx = await this.extractionAgent.extract(ctx);

      // Confidence scoring
      ctx = await this.confidenceScorer.score(ctx);

      return { success: true, context: ctx };
    } catch (error) {
      return { success: false, error, stage: ctx.currentStage };
    }
  }
}
```

---

## 6. ClassificationAgent

### 6.1 Purpose

Classifies a document into one of 15 predefined categories with a confidence score.

### 6.2 Approach

1. Extract first 2000 characters of OCR text
2. Include detected language and any visual cues (page count, header patterns)
3. Call LLM with classification prompt
4. Parse structured response
5. If confidence < 0.6, mark as UNKNOWN and flag for review

### 6.3 Full Implementation

```typescript
@Injectable()
export class ClassificationAgent implements Agent<ClassificationInput, ClassificationOutput> {
  readonly name = 'ClassificationAgent';

  async execute(
    input: ClassificationInput,
    ctx: AgentContext
  ): Promise<AgentResult<ClassificationOutput>> {
    const llm = await this.llmFactory.getAvailableProvider();

    // Extract representative text (avoid feeding too much to LLM)
    const representativeText = this.extractRepresentativeText(input.ocrPages, {
      maxChars: 2000,
      preferFirstPage: true,
      preferHeaders: true,
    });

    const prompt = this.buildClassificationPrompt(representativeText, input.detectedLanguage);

    const response = await llm.complete({
      messages: [
        {
          role: 'system',
          content: `You are an expert at classifying Indian government and official documents. 
Analyze the provided text and classify the document accurately.
You must respond ONLY with valid JSON matching the specified schema.`
        },
        { role: 'user', content: prompt }
      ],
      responseFormat: 'json_object',
      temperature: 0.0,  // Classification must be deterministic
    });

    const classification = ClassificationSchema.parse(JSON.parse(response.content!));

    return {
      success: true,
      data: classification,
      metadata: {
        agent: this.name,
        provider: llm.name,
        model: llm.currentModel,
        tokensUsed: response.usage.totalTokens,
        latencyMs: response.latencyMs,
        confidence: classification.confidence,
      },
    };
  }

  private buildClassificationPrompt(text: string, language: string): string {
    return `Analyze this Indian document text and classify it into exactly ONE category.

Document text:
"""
${text}
"""

Detected language: ${language}

Classify into one of these categories:
- GOVERNMENT_NOTICE: Official government notices, circulars, orders (सरकारी नोटिस, सरकारी आदेश)
- INVOICE: Commercial invoices, bills from vendors or businesses (बिल, चालान)
- RECEIPT: Payment receipts, purchase receipts (रसीद)
- CERTIFICATE: Official certificates (degree, birth, caste, income, domicile) (प्रमाण पत्र)
- COLLEGE_DOCUMENT: Admit cards, mark sheets, college circulars, fee receipts (कॉलेज दस्तावेज़)
- BANK_DOCUMENT: Bank statements, passbooks, bank letters (बैंक दस्तावेज़)
- LEGAL_DOCUMENT: Contracts, agreements, legal notices, affidavits (कानूनी दस्तावेज़)
- EMPLOYMENT_DOCUMENT: Offer letters, appointment letters, payslips, experience letters (रोजगार दस्तावेज़)
- FORM: Application forms, registration forms (आवेदन पत्र)
- LETTER: Official or personal correspondence (पत्र)
- IDENTITY_DOCUMENT: Aadhaar, PAN, voter ID, driving license (पहचान पत्र)
- MEDICAL_DOCUMENT: Medical reports, prescriptions, hospital documents (चिकित्सा दस्तावेज़)
- INSURANCE_DOCUMENT: Insurance policies, claim forms (बीमा दस्तावेज़)
- TAX_DOCUMENT: Tax returns, Form 16, GST documents (कर दस्तावेज़)
- UNKNOWN: Cannot determine with confidence

Respond with JSON:
{
  "category": "CATEGORY_NAME",
  "confidence": 0.XX,
  "reasoning": "Brief explanation in English of why you chose this category",
  "alternative_category": "SECOND_MOST_LIKELY_CATEGORY",
  "alternative_confidence": 0.XX,
  "key_indicators": ["indicator1", "indicator2", "indicator3"]
}`;
  }
}
```

---

## 7. ExtractionAgent

### 7.1 Purpose

Extracts structured fields from a document using a category-specific schema. Uses LLM tool-calling to ensure structured output.

### 7.2 Schema Registry

```typescript
// packages/ai/src/agents/extraction/schema-registry.ts

export const ExtractionSchemas: Record<DocumentCategory, ExtractionSchema> = {
  [DocumentCategory.GOVERNMENT_NOTICE]: {
    fields: [
      { name: 'title', type: 'TEXT', description: 'Title or subject of the notice', required: true },
      { name: 'issuing_authority', type: 'TEXT', description: 'Government department or body issuing the notice', required: true },
      { name: 'notice_number', type: 'ID_NUMBER', description: 'Reference/notice number', required: false },
      { name: 'issue_date', type: 'DATE', description: 'Date when the notice was issued', required: true },
      { name: 'effective_date', type: 'DATE', description: 'Date from which the notice is effective', required: false },
      { name: 'deadline', type: 'DATE', description: 'Last date for action or application', required: false },
      { name: 'eligibility', type: 'TEXT', description: 'Eligibility criteria mentioned', required: false },
      { name: 'required_documents', type: 'LIST', description: 'List of documents required', required: false },
      { name: 'contact_information', type: 'TEXT', description: 'Contact details for queries', required: false },
      { name: 'subject', type: 'TEXT', description: 'Brief subject/topic of notice', required: false },
    ],
    promptHints: {
      hi: 'यह एक सरकारी नोटिस है। सभी महत्वपूर्ण जानकारी निकालें।',
      en: 'This is a government notice. Extract all important administrative information.',
    },
  },

  [DocumentCategory.INVOICE]: {
    fields: [
      { name: 'invoice_number', type: 'ID_NUMBER', description: 'Invoice or bill number', required: true },
      { name: 'vendor_name', type: 'NAME', description: 'Name of the selling party/company', required: true },
      { name: 'vendor_gstin', type: 'ID_NUMBER', description: 'GSTIN of vendor (format: 2-digit state code + 10-char PAN + 1 + Z + 1 check)', required: false },
      { name: 'buyer_name', type: 'NAME', description: 'Name of buyer/recipient', required: false },
      { name: 'invoice_date', type: 'DATE', description: 'Date of invoice', required: true },
      { name: 'due_date', type: 'DATE', description: 'Payment due date if mentioned', required: false },
      { name: 'subtotal', type: 'CURRENCY', description: 'Amount before tax', required: false },
      { name: 'tax_amount', type: 'CURRENCY', description: 'Total tax (GST/VAT/other)', required: false },
      { name: 'total_amount', type: 'CURRENCY', description: 'Total amount payable', required: true },
      { name: 'currency', type: 'TEXT', description: 'Currency (INR, USD, etc.)', required: false },
      { name: 'items', type: 'LIST', description: 'List of line items with description and amount', required: false },
    ],
    promptHints: {
      en: 'This is an invoice. Extract all billing information accurately. For currency amounts, extract the numeric value only without currency symbol.',
    },
  },

  [DocumentCategory.CERTIFICATE]: {
    fields: [
      { name: 'holder_name', type: 'NAME', description: 'Full name of the certificate holder', required: true },
      { name: 'certificate_type', type: 'TEXT', description: 'Type of certificate (degree, caste, income, domicile, etc.)', required: true },
      { name: 'certificate_number', type: 'ID_NUMBER', description: 'Certificate registration or serial number', required: false },
      { name: 'issue_date', type: 'DATE', description: 'Date of certificate issuance', required: true },
      { name: 'expiry_date', type: 'DATE', description: 'Validity expiry date if applicable', required: false },
      { name: 'issuing_authority', type: 'TEXT', description: 'Authority or institution issuing the certificate', required: true },
      { name: 'purpose', type: 'TEXT', description: 'Purpose or subject of the certificate', required: false },
    ],
    promptHints: {
      hi: 'यह एक प्रमाण पत्र है। नाम, तारीख और जारी करने वाली संस्था की जानकारी निकालें।',
      en: 'This is a certificate. Extract the holder name, dates, issuing authority, and certificate details.',
    },
  },

  // ... (similar schemas for all 15 document types)
};
```

### 7.3 Extraction Prompt Builder

```typescript
buildExtractionPrompt(
  ocrText: string,
  schema: ExtractionSchema,
  category: DocumentCategory,
  language: string
): string {
  const languageHint = schema.promptHints[language as 'hi' | 'en']
    ?? schema.promptHints['en'];

  const fieldDescriptions = schema.fields
    .map(f => `- ${f.name} (${f.type}): ${f.description}${f.required ? ' [REQUIRED]' : ' [OPTIONAL]'}`)
    .join('\n');

  return `${languageHint}

Document text (${language} language):
"""
${ocrText}
"""

Extract the following fields from this ${category.replace('_', ' ').toLowerCase()}:
${fieldDescriptions}

IMPORTANT RULES:
1. Extract ONLY information that is explicitly stated in the text
2. For REQUIRED fields, if not found: set value to null and confidence to 0
3. For dates: use format YYYY-MM-DD when possible, or the exact text if uncertain
4. For amounts: extract numeric value only (e.g., "5000" not "Rs. 5,000")
5. Assign confidence based on text clarity: 0.95 = crystal clear, 0.80 = likely correct, 0.65 = uncertain, 0.50 = very uncertain
6. For LIST type: return an array of strings
7. NEVER invent or guess values

Return valid JSON:
{
  "fields": [
    {
      "field_name": "...",
      "value": "...",
      "confidence": 0.XX,
      "source_text": "exact text from document that provided this value",
      "page_hint": "page 1 / page 2 / unknown"
    }
  ],
  "extraction_notes": "Any special observations about the document"
}`;
}
```

---

## 8. OCROrchestrator — Intelligent OCR Agent

### 8.1 Purpose

Manages the OCR process for a document version, intelligently routing pages and regions to the appropriate OCR provider based on confidence scores and document characteristics.

### 8.2 Decision Logic

```
For each page:
    ↓
[Run PaddleOCR (primary)]
    ↓
Page confidence >= 0.75?
    |                |
   YES              NO
    |                ↓
    |         [Run VLM on entire page]
    |                ↓
    |         Merge results, pick better
    ↓
Identify low-confidence blocks (< 0.70)
    ↓
Any low-conf blocks?
    |                |
   NO              YES
    |                ↓
    |         [Run VLM on block regions only]
    |                ↓
    |         Replace low-conf blocks with VLM output
    ↓
Return final merged OcrPageResult
```

### 8.3 Block-Level VLM Fallback

```typescript
async enhanceLowConfidenceBlocks(
  pageResult: OcrPageResult,
  lowConfBlocks: OcrBlock[],
  pagePath: string
): Promise<OcrPageResult> {
  // Crop the low-confidence regions from the page image
  const crops = await Promise.all(
    lowConfBlocks.map(block =>
      this.imageProcessor.cropRegion(pagePath, block.bbox)
    )
  );

  // Process each crop with VLM
  const vlmResults = await Promise.all(
    crops.map((cropPath, idx) =>
      this.vlmProvider.processRegion({
        imagePath: cropPath,
        hint: `This region of an Indian document may contain Hindi or English text. Extract the text exactly.`,
        blockContext: lowConfBlocks[idx],
      })
    )
  );

  // Replace low-confidence blocks with VLM results
  const enhancedBlocks = pageResult.blocks.map(block => {
    const lowConfIdx = lowConfBlocks.findIndex(b => b.id === block.id);
    if (lowConfIdx !== -1) {
      const vlmText = vlmResults[lowConfIdx].text;
      return {
        ...block,
        text: vlmText,
        confidence: vlmResults[lowConfIdx].confidence,
        fallbackUsed: true,
        fallbackProvider: 'vlm',
        originalText: block.text,
        originalConfidence: block.confidence,
      };
    }
    return block;
  });

  return {
    ...pageResult,
    blocks: enhancedBlocks,
    pageConfidence: this.calculatePageConfidence(enhancedBlocks),
    fallbackUsed: true,
  };
}
```

---

## 9. SearchAgent — Hybrid Search Agent

### 9.1 Architecture

```
User Query
    │
    ▼
QueryPreprocessor
    ├── Language Detection
    ├── Query Cleaning (remove filler words)
    ├── Query Expansion (optional: add synonyms)
    └── Entity Extraction (dates, amounts, names)
    │
    ▼
HybridRetriever (parallel)
    ├── SemanticSearcher (pgvector)
    └── KeywordSearcher (PostgreSQL FTS + pg_trgm)
    │
    ▼
ResultMerger
    ├── Score Normalization (min-max)
    ├── Hybrid Scoring (alpha * semantic + beta * keyword)
    └── Deduplication
    │
    ▼
Reranker (optional cross-encoder)
    │
    ▼
ContextAssembler
    ├── Token budget management
    ├── Source metadata attachment
    └── Deduplication by source
    │
    ▼
[Return to DocumentAgent as tool result]
```

### 9.2 Query Expansion for Hindi

```typescript
@Injectable()
export class HindiQueryExpander {
  // Simple dictionary-based expansion for common query terms
  private readonly synonymDictionary: Record<string, string[]> = {
    'deadline': ['antim tarikh', 'last date', 'अंतिम तारीख', 'due date'],
    'amount': ['raashi', 'paisa', 'राशि', 'total', 'kitna'],
    'certificate': ['praman patra', 'प्रमाण पत्र', 'cert', 'document'],
    'notice': ['notic', 'सूचना', 'patrachar', 'circular'],
    'eligibility': ['yogyata', 'पात्रता', 'criteria', 'qualification'],
    // ... more synonyms
  };

  expand(query: string, language: SupportedLanguage): string[] {
    const queries = [query];

    for (const [key, synonyms] of Object.entries(this.synonymDictionary)) {
      if (query.toLowerCase().includes(key.toLowerCase())) {
        synonyms.forEach(syn => {
          queries.push(query.toLowerCase().replace(key.toLowerCase(), syn));
        });
      }
    }

    return [...new Set(queries)]; // Deduplicate
  }
}
```

---

## 10. ComparisonAgent — Document Diff Agent

### 10.1 Purpose

Compares two documents or document versions at multiple levels:
1. **Field-level diff:** Compare extracted structured fields
2. **Text diff:** Word-level diff of OCR text per page
3. **Semantic diff:** Use embeddings to identify semantically significant changes

### 10.2 Implementation

```typescript
@Injectable()
export class ComparisonAgent implements Agent<ComparisonInput, ComparisonOutput> {
  readonly name = 'ComparisonAgent';

  async execute(
    input: ComparisonInput,
    ctx: AgentContext
  ): Promise<AgentResult<ComparisonOutput>> {
    // 1. Field-level diff
    const fieldDiff = await this.computeFieldDiff(
      input.version1Fields,
      input.version2Fields
    );

    // 2. Text diff (page-by-page)
    const textDiff = await this.computeTextDiff(
      input.version1Pages,
      input.version2Pages
    );

    // 3. Semantic diff using embeddings
    const semanticDiff = await this.computeSemanticDiff(
      input.version1Chunks,
      input.version2Chunks
    );

    // 4. Generate human-readable summary using LLM
    const summary = await this.generateChangeSummary(
      fieldDiff, textDiff, semanticDiff, ctx
    );

    return {
      success: true,
      data: {
        field_diffs: fieldDiff,
        text_diffs: textDiff,
        semantic_changes: semanticDiff,
        change_summary: summary,
        total_changes: fieldDiff.length + textDiff.filter(d => d.hasChanges).length,
        severity: this.assessChangeSeverity(fieldDiff, semanticDiff),
      },
    };
  }

  private async computeFieldDiff(
    fields1: DocumentField[],
    fields2: DocumentField[]
  ): Promise<FieldDiff[]> {
    const allFieldNames = new Set([
      ...fields1.map(f => f.fieldName),
      ...fields2.map(f => f.fieldName),
    ]);

    return Array.from(allFieldNames).map(fieldName => {
      const f1 = fields1.find(f => f.fieldName === fieldName);
      const f2 = fields2.find(f => f.fieldName === fieldName);

      if (!f1 && f2) return { fieldName, type: 'ADDED', newValue: f2.rawValue };
      if (f1 && !f2) return { fieldName, type: 'REMOVED', oldValue: f1.rawValue };
      if (f1 && f2 && f1.rawValue !== f2.rawValue) {
        return {
          fieldName,
          type: 'CHANGED',
          oldValue: f1.rawValue,
          newValue: f2.rawValue,
          semanticallySimilar: this.areValuesSemanticallyEquivalent(f1.rawValue, f2.rawValue),
        };
      }
      return { fieldName, type: 'UNCHANGED', value: f1!.rawValue };
    });
  }

  private async computeSemanticDiff(
    chunks1: DocumentChunk[],
    chunks2: DocumentChunk[]
  ): Promise<SemanticChange[]> {
    // For each chunk in v2, find most similar chunk in v1
    // If similarity < threshold, the section has changed significantly
    const changes: SemanticChange[] = [];

    for (const chunk2 of chunks2) {
      const embedding2 = await this.embeddingProvider.embed(chunk2.content);

      let maxSimilarity = 0;
      let mostSimilarChunk: DocumentChunk | null = null;

      for (const chunk1 of chunks1) {
        const embedding1 = await this.getOrCacheEmbedding(chunk1);
        const similarity = this.cosineSimilarity(embedding1, embedding2);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilarChunk = chunk1;
        }
      }

      if (maxSimilarity < 0.85) {
        changes.push({
          chunkId: chunk2.id,
          pageNumber: chunk2.pageNumber,
          sectionTitle: chunk2.sectionTitle,
          content: chunk2.content,
          similarityToOriginal: maxSimilarity,
          changeType: maxSimilarity < 0.50 ? 'MAJOR' : 'MINOR',
          mostSimilarOriginalChunk: mostSimilarChunk?.id,
        });
      }
    }

    return changes.sort((a, b) => a.similarityToOriginal - b.similarityToOriginal);
  }

  private async generateChangeSummary(
    fieldDiff: FieldDiff[],
    textDiff: any[],
    semanticDiff: SemanticChange[],
    ctx: AgentContext
  ): Promise<string> {
    const llm = await this.llmFactory.getAvailableProvider();

    const changedFields = fieldDiff.filter(d => d.type !== 'UNCHANGED');
    const majorSemanticChanges = semanticDiff.filter(s => s.changeType === 'MAJOR');

    const prompt = `Based on the following comparison data between two versions of an Indian document, write a concise change summary in plain language.

Changed fields (${changedFields.length}):
${JSON.stringify(changedFields, null, 2)}

Major semantic changes (${majorSemanticChanges.length}):
${majorSemanticChanges.map(s => `- Page ${s.pageNumber}: ${s.sectionTitle ?? 'Section'} changed significantly`).join('\n')}

Write a 2-3 sentence summary of what changed between the two versions. Focus on implications for the reader.`;

    const response = await llm.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    return response.content!;
  }
}
```

---

## 11. LanguageAgent — Multilingual Processing Agent

### 11.1 Purpose

Detects and normalizes language information at three levels:
- Block level: each OCR block tagged with language
- Page level: aggregate language per page
- Document level: primary and secondary languages

### 11.2 Script Detection

```typescript
@Injectable()
export class LanguageAgent implements Agent<LanguageInput, LanguageOutput> {
  readonly name = 'LanguageAgent';

  // Unicode ranges for script detection (no API call needed)
  private readonly DEVANAGARI_RANGE = /[\u0900-\u097F]/;
  private readonly LATIN_RANGE = /[a-zA-Z]/;

  async execute(
    input: LanguageInput,
    ctx: AgentContext
  ): Promise<AgentResult<LanguageOutput>> {
    const pageLanguages: PageLanguage[] = [];

    for (const page of input.ocrPages) {
      const blockLanguages: BlockLanguage[] = [];

      for (const block of page.blocks) {
        const devanagariChars = (block.text.match(this.DEVANAGARI_RANGE) ?? []).length;
        const latinChars = (block.text.match(this.LATIN_RANGE) ?? []).length;
        const totalChars = block.text.replace(/\s/g, '').length;

        const devanagariRatio = totalChars > 0 ? devanagariChars / totalChars : 0;
        const latinRatio = totalChars > 0 ? latinChars / totalChars : 0;

        let language: BlockLanguageCode;
        let confidence: number;

        if (devanagariRatio > 0.6) {
          language = 'hi';
          confidence = devanagariRatio;
        } else if (latinRatio > 0.6) {
          language = 'en';
          confidence = latinRatio;
        } else if (devanagariRatio > 0.2 && latinRatio > 0.2) {
          language = 'hi+en';
          confidence = 0.7;
        } else {
          language = 'unknown';
          confidence = 0.5;
        }

        blockLanguages.push({ blockId: block.id, language, confidence });
      }

      // Page-level language is majority vote
      const pageLang = this.computePageLanguage(blockLanguages);
      pageLanguages.push({ pageNumber: page.pageNumber, ...pageLang, blocks: blockLanguages });
    }

    // Document-level language
    const documentLanguage = this.computeDocumentLanguage(pageLanguages);

    return {
      success: true,
      data: {
        documentLanguage: documentLanguage.primary,
        secondaryLanguages: documentLanguage.secondary,
        pageLanguages,
        isMixed: documentLanguage.secondary.length > 0,
      },
      metadata: {
        agent: this.name,
        provider: 'local',
        model: 'script-detection-v1',
        tokensUsed: 0,          // No LLM call for script detection
        latencyMs: 0,
        confidence: documentLanguage.confidence,
      },
    };
  }

  private computeDocumentLanguage(pages: PageLanguage[]): DocumentLanguageResult {
    const hindiPages = pages.filter(p => p.language === 'hi' || p.language === 'hi+en').length;
    const englishPages = pages.filter(p => p.language === 'en' || p.language === 'hi+en').length;
    const mixedPages = pages.filter(p => p.language === 'hi+en').length;

    const total = pages.length;

    if (hindiPages / total > 0.7 && mixedPages / total < 0.3) {
      return { primary: 'hi', secondary: [], confidence: 0.9 };
    }
    if (englishPages / total > 0.7 && mixedPages / total < 0.3) {
      return { primary: 'en', secondary: [], confidence: 0.9 };
    }
    if (hindiPages > 0 && englishPages > 0) {
      return {
        primary: hindiPages > englishPages ? 'hi' : 'en',
        secondary: hindiPages > englishPages ? ['en'] : ['hi'],
        confidence: 0.8,
      };
    }

    return { primary: 'unknown', secondary: [], confidence: 0.5 };
  }
}
```

---

## 12. Agent Orchestration & Communication

### 12.1 Agent Context Propagation

```typescript
// AgentContext flows from API request through all agents
interface AgentContext {
  // Tracing
  requestId: string;
  traceId: string;
  spanId: string;

  // User context
  userId: string;
  organizationId?: string;

  // Document context
  documentId?: string;
  versionId?: string;
  conversationId?: string;

  // Processing preferences
  language?: SupportedLanguage;
  llmProvider?: string;       // Override default provider
  ocrProvider?: string;       // Override default OCR provider

  // Limits
  maxTokens?: number;
  timeout?: number;

  // Debug
  debugMode?: boolean;
}
```

### 12.2 Agent Communication (Processing Pipeline)

Agents in the processing pipeline communicate via a `PipelineContext` object that grows as stages complete:

```typescript
interface PipelineContext extends AgentContext {
  // Set at pipeline start
  versionId: string;
  storagePath: string;

  // Set by PDF_RENDERING stage
  renderedPagePaths?: string[];

  // Set by OCR stage
  ocrResults?: OcrPageResult[];
  rawText?: string;

  // Set by LANGUAGE_DETECTION stage
  detectedLanguage?: LanguageOutput;

  // Set by CLASSIFICATION stage
  classification?: ClassificationOutput;

  // Set by EXTRACTION stage
  extractedFields?: ExtractedField[];

  // Set by CONFIDENCE_SCORING stage
  fieldConfidences?: FieldConfidence[];
  overallConfidence?: number;

  // Mutable stage tracking
  currentStage: ProcessingStage;
  completedStages: ProcessingStage[];
  stageErrors: Record<string, Error>;
}
```

### 12.3 Agent Registry

```typescript
@Injectable()
export class AgentRegistry {
  private readonly agents = new Map<string, Agent<any, any>>();

  register<T extends Agent<any, any>>(agent: T): void {
    this.agents.set(agent.name, agent);
  }

  get<T extends Agent<any, any>>(name: string): T {
    const agent = this.agents.get(name) as T;
    if (!agent) throw new Error(`Agent "${name}" not registered`);
    return agent;
  }
}
```

---

## 13. Prompt Engineering Guide

### 13.1 Prompt Design Principles

1. **Language Specificity:** Always tell the LLM what language the document is in and what language to respond in.

2. **Constraint Injection:** Put rules in the system prompt, not the user turn. System rules are harder for models to ignore.

3. **Schema-Driven Output:** For extraction, use JSON Schema in the prompt (not OpenAI function calling alone, as output quality is better with both).

4. **Examples Improve Performance:** For low-frequency document types, include 1-2 few-shot examples in the prompt.

5. **Temperature Control:**
   - Classification: 0.0 (deterministic)
   - Extraction: 0.1 (near-deterministic, small variance)
   - Summarization: 0.3 (some creativity allowed)
   - Chat answers: 0.2 (factual but natural)

6. **Context Length Budget:**
   - Keep system prompt + document context under 70% of model's context window
   - Reserve 30% for output

### 13.2 Language-Adaptive Prompting

```typescript
// Builds the right system prompt based on detected language
function buildLanguageAdaptiveSystemPrompt(
  task: 'extraction' | 'classification' | 'summarization' | 'chat',
  documentLanguage: string,
  queryLanguage: string
): string {
  const languageInstructions = {
    hi: {
      extraction: 'दस्तावेज़ हिंदी में है। हिंदी में लिखी जानकारी को ध्यानपूर्वक पढ़कर निकालें।',
      chat: 'उपयोगकर्ता हिंदी में पूछ रहे हैं। हिंदी में उत्तर दें।',
    },
    en: {
      extraction: 'The document is in English. Extract information accurately from the English text.',
      chat: 'The user is asking in English. Respond in English.',
    },
    'hi+en': {
      extraction: 'The document contains both Hindi and English. Extract information from both parts carefully.',
      chat: 'The document is bilingual. Answer in the same language as the question.',
    },
  };

  return languageInstructions[documentLanguage]?.[task]
    ?? languageInstructions['en'][task];
}
```

### 13.3 Anti-Hallucination Patterns

```typescript
// Pattern 1: Explicit refusal instruction
const ANTI_HALLUCINATION_RULE = `
CRITICAL: If the answer to a question is not present in the provided context or document,
you MUST respond with: "I could not find this information in the provided documents."
DO NOT use your training knowledge to fill in gaps. It is better to say "I don't know"
than to provide incorrect information about a user's legal or official document.
`;

// Pattern 2: Source attribution requirement
const SOURCE_ATTRIBUTION_RULE = `
For every factual claim in your response, cite the source as: [Source: Page X, Section Y]
If you cannot cite a source, do not make the claim.
`;

// Pattern 3: Confidence flagging
const UNCERTAINTY_FLAGGING_RULE = `
If you are uncertain about any part of your answer, explicitly state the uncertainty:
"This information appears to be on Page 2, but I am not fully certain."
Never present uncertain information as definitive.
`;
```

---

## 14. Safety & Guardrails

### 14.1 Input Sanitization

```typescript
@Injectable()
export class InputSanitizer {
  sanitizeUserQuery(query: string): string {
    // Remove potential prompt injection attempts
    const promptInjectionPatterns = [
      /ignore previous instructions/gi,
      /system prompt/gi,
      /you are now/gi,
      /forget everything/gi,
      /act as/gi,
      /roleplay as/gi,
    ];

    let sanitized = query;
    for (const pattern of promptInjectionPatterns) {
      sanitized = sanitized.replace(pattern, '[filtered]');
    }

    // Limit query length
    return sanitized.slice(0, 2000);
  }
}
```

### 14.2 Output Validation

```typescript
@Injectable()
export class OutputValidator {
  validateExtractedFields(fields: ExtractedField[], schema: ExtractionSchema): ValidationResult {
    const errors: ValidationError[] = [];

    for (const field of fields) {
      const schemaField = schema.fields.find(f => f.name === field.fieldName);
      if (!schemaField) continue;

      // Validate date fields
      if (schemaField.type === 'DATE' && field.value) {
        if (!this.isValidDate(field.value)) {
          errors.push({
            fieldName: field.fieldName,
            error: 'Invalid date format',
            value: field.value,
          });
          // Reduce confidence for malformed dates
          field.confidence = Math.min(field.confidence, 0.50);
          field.confidenceLevel = 'LOW';
        }
      }

      // Validate GSTIN format
      if (field.fieldName === 'vendor_gstin' && field.value) {
        if (!this.isValidGSTIN(field.value)) {
          errors.push({ fieldName: 'vendor_gstin', error: 'Invalid GSTIN format', value: field.value });
          field.confidence = 0.30;
        }
      }

      // Validate amount fields are numeric
      if (schemaField.type === 'CURRENCY' && field.value) {
        const numericValue = parseFloat(field.value.replace(/[,\s]/g, ''));
        if (isNaN(numericValue)) {
          errors.push({ fieldName: field.fieldName, error: 'Amount is not numeric', value: field.value });
          field.confidence = Math.min(field.confidence, 0.50);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  validateChatResponse(response: string, retrievedChunks: DocumentChunk[]): boolean {
    // Check if response contains any factual claims
    // If so, verify they appear in the retrieved chunks
    // This is a heuristic check, not perfect
    const claimKeywords = /\d{4}|₹|Rs\.|\d+%|date:|deadline:/gi;
    const hasClaims = claimKeywords.test(response);

    if (hasClaims && retrievedChunks.length === 0) {
      // Claims with no sources — potential hallucination
      this.logger.warn('ChatResponse: Claims detected without retrieved context');
      return false;
    }

    return true;
  }
}
```

### 14.3 Rate Limiting for AI Calls

```typescript
@Injectable()
export class AIRateLimiter {
  // Per-user limits to prevent cost explosions
  private readonly LIMITS = {
    chatMessages: { requests: 30, windowMs: 60000 },       // 30 per minute
    documentProcessing: { requests: 5, windowMs: 60000 },  // 5 per minute
    search: { requests: 60, windowMs: 60000 },             // 60 per minute
  };

  async checkLimit(userId: string, operation: keyof typeof this.LIMITS): Promise<void> {
    const limit = this.LIMITS[operation];
    const key = `ai:rate:${userId}:${operation}`;

    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, Math.ceil(limit.windowMs / 1000));

    if (count > limit.requests) {
      throw new TooManyRequestsException(
        `Rate limit exceeded for ${operation}. Please wait before trying again.`
      );
    }
  }
}
```

---

## 15. Agent Observability

### 15.1 Agent Execution Logging

Every agent call produces a structured log entry:

```typescript
interface AgentExecutionLog {
  // Identifiers
  traceId: string;
  requestId: string;
  agentName: string;
  agentVersion: string;

  // Execution
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  success: boolean;

  // AI Provider
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;

  // Quality
  confidence?: number;
  toolCallCount?: number;
  fallbackUsed?: boolean;

  // Context (sanitized)
  userId: string;
  documentId?: string;
  queryLanguage?: string;
  outputLanguage?: string;

  // Error
  errorCode?: string;
  errorMessage?: string;
}
```

### 15.2 AI Cost Tracking

```typescript
// Track AI costs per user, per provider, per day
@Injectable()
export class AICostTracker {
  async trackUsage(log: AgentExecutionLog): Promise<void> {
    const costPerToken = this.getCostPerToken(log.provider, log.model);
    const cost = log.totalTokens * costPerToken;

    // Store in Redis for real-time tracking
    const today = new Date().toISOString().split('T')[0];
    await this.redis.incrbyfloat(`cost:user:${log.userId}:${today}`, cost);
    await this.redis.incrbyfloat(`cost:global:${today}`, cost);

    // Store in DB for analytics and billing
    await this.prisma.aiUsageLog.create({
      data: {
        userId: log.userId,
        agent: log.agentName,
        provider: log.provider,
        model: log.model,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        estimatedCostUsd: cost,
        documentId: log.documentId,
        createdAt: new Date(),
      },
    });
  }

  private getCostPerToken(provider: string, model: string): number {
    const costs: Record<string, number> = {
      'openai:gpt-4o': 0.000005,          // $5 per 1M tokens (blended)
      'openai:gpt-4o-mini': 0.0000006,    // $0.60 per 1M tokens
      'openai:text-embedding-3-small': 0.00000002,
      'gemini:gemini-1.5-flash': 0.000000075,
      'anthropic:claude-3-haiku': 0.000001,
    };
    return costs[`${provider}:${model}`] ?? 0;
  }
}
```

---

## 16. Agent Testing Strategy

### 16.1 Unit Tests for Agents

```typescript
// ClassificationAgent unit test
describe('ClassificationAgent', () => {
  let agent: ClassificationAgent;
  let mockLLM: jest.Mocked<LLMProvider>;

  beforeEach(() => {
    mockLLM = {
      name: 'mock',
      complete: jest.fn(),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    // ... setup
  });

  it('should classify a government notice correctly', async () => {
    // Arrange
    const ocrText = `
      राज्य सरकार, शिक्षा विभाग
      नोटिस संख्या: EDU/2026/4521
      विषय: छात्रवृत्ति योजना 2026-27
      आवेदन की अंतिम तिथि: 20 अगस्त 2026
    `;

    mockLLM.complete.mockResolvedValue({
      content: JSON.stringify({
        category: 'GOVERNMENT_NOTICE',
        confidence: 0.94,
        reasoning: 'Contains government department header, notice number, and Hindi administrative language',
        alternative_category: 'COLLEGE_DOCUMENT',
        alternative_confidence: 0.12,
        key_indicators: ['राज्य सरकार', 'नोटिस संख्या', 'शिक्षा विभाग'],
      }),
      usage: { promptTokens: 200, completionTokens: 80, totalTokens: 280 },
      finishReason: 'stop',
      latencyMs: 500,
    });

    // Act
    const result = await agent.execute(
      { ocrPages: [{ rawText: ocrText }], detectedLanguage: 'hi' },
      mockAgentContext
    );

    // Assert
    expect(result.success).toBe(true);
    expect(result.data!.category).toBe('GOVERNMENT_NOTICE');
    expect(result.data!.confidence).toBeGreaterThan(0.8);
  });

  it('should return UNKNOWN for unrecognizable document with low confidence', async () => {
    mockLLM.complete.mockResolvedValue({
      content: JSON.stringify({
        category: 'UNKNOWN',
        confidence: 0.45,
        reasoning: 'Text is too fragmented to determine document type',
        key_indicators: [],
      }),
      // ...
    });

    const result = await agent.execute(
      { ocrPages: [{ rawText: 'xkck lskcj' }], detectedLanguage: 'unknown' },
      mockAgentContext
    );

    expect(result.data!.category).toBe('UNKNOWN');
    expect(result.data!.confidence).toBeLessThan(0.6);
  });
});
```

### 16.2 Golden Test Dataset

Maintain a set of 30+ "golden" test documents with known expected outputs:

```typescript
interface GoldenTestCase {
  id: string;
  documentPath: string;          // Path to test fixture
  expectedCategory: DocumentCategory;
  expectedLanguage: SupportedLanguage;
  expectedFields: {
    fieldName: string;
    expectedValue: string;
    minConfidence: number;
    fuzzyMatch?: boolean;         // Allow partial matches for long text fields
  }[];
  expectedOcrMinAccuracy: number; // Minimum CER threshold
  tags: string[];                 // e.g., ['hindi', 'handwritten', 'government']
}

const goldenTestCases: GoldenTestCase[] = [
  {
    id: 'gov-notice-hindi-001',
    documentPath: 'tests/fixtures/bihar_scholarship_notice_2026.pdf',
    expectedCategory: 'GOVERNMENT_NOTICE',
    expectedLanguage: 'hi',
    expectedFields: [
      { fieldName: 'deadline', expectedValue: '2026-08-20', minConfidence: 0.75 },
      { fieldName: 'issuing_authority', expectedValue: 'Bihar State Government', minConfidence: 0.70, fuzzyMatch: true },
    ],
    expectedOcrMinAccuracy: 0.88,
    tags: ['hindi', 'printed', 'government', 'scholarship'],
  },
  {
    id: 'invoice-gst-english-001',
    documentPath: 'tests/fixtures/gst_invoice_sample.pdf',
    expectedCategory: 'INVOICE',
    expectedLanguage: 'en',
    expectedFields: [
      { fieldName: 'total_amount', expectedValue: '47200', minConfidence: 0.85 },
      { fieldName: 'vendor_gstin', expectedValue: '27AAPCS1234M1Z5', minConfidence: 0.80 },
    ],
    expectedOcrMinAccuracy: 0.95,
    tags: ['english', 'invoice', 'gst', 'printed'],
  },
  // ... 28 more cases covering all document types and languages
];
```

### 16.3 E2E Agent Tests

```typescript
// End-to-end test for DocumentAgent with real search
describe('DocumentAgent E2E', () => {
  it('should answer a Hindi question with Hindi citation', async () => {
    // This test uses a real test database with seeded document
    const conversationId = await createTestConversation(testUserId, testDocumentId);

    const result = await documentAgent.execute(
      { query: 'इस नोटिस की अंतिम तारीख क्या है?', conversationId },
      { userId: testUserId, documentId: testDocumentId }
    );

    expect(result.success).toBe(true);
    expect(result.data!.answer).toContain('20 अगस्त 2026');
    expect(result.data!.citations).toHaveLength(1);
    expect(result.data!.citations[0].pageNumber).toBe(2);
    expect(result.data!.language).toBe('hi');
  });

  it('should refuse to hallucinate when information is not in document', async () => {
    const result = await documentAgent.execute(
      { query: 'What is the Prime Minister of India?', conversationId },
      { userId: testUserId, documentId: testDocumentId }
    );

    // Should gracefully decline
    expect(result.data!.answer).toMatch(
      /could not find|not in your document|information not available/i
    );
    expect(result.data!.citations).toHaveLength(0);
  });

  it('should handle Hinglish queries naturally', async () => {
    const result = await documentAgent.execute(
      { query: 'Is form ki last date kya hai?', conversationId },
      { userId: testUserId, documentId: testDocumentId }
    );

    expect(result.success).toBe(true);
    expect(result.data!.answer.length).toBeGreaterThan(20);
    expect(result.data!.citations.length).toBeGreaterThan(0);
  });
});
```

---

## 17. Multi-Provider Failover Strategy

### 17.1 Provider Priority Chain

```typescript
// packages/ai/src/llm/provider-chain.ts

export const DEFAULT_PROVIDER_CHAIN = [
  { provider: 'openai', model: 'gpt-4o-mini', priority: 1 },        // Primary: fast, cheap
  { provider: 'openai', model: 'gpt-4o', priority: 2 },            // Fallback to full GPT-4o
  { provider: 'gemini', model: 'gemini-1.5-flash', priority: 3 },  // Google fallback
  { provider: 'anthropic', model: 'claude-3-haiku', priority: 4 }, // Anthropic fallback
];

export const EXTRACTION_PROVIDER_CHAIN = [
  { provider: 'openai', model: 'gpt-4o', priority: 1 },            // Best structured output
  { provider: 'gemini', model: 'gemini-1.5-pro', priority: 2 },
  { provider: 'anthropic', model: 'claude-3-5-sonnet', priority: 3 },
];
```

### 17.2 Circuit Breaker

```typescript
@Injectable()
export class LLMCircuitBreaker {
  private readonly FAILURE_THRESHOLD = 5;   // Failures before opening
  private readonly RESET_TIMEOUT = 60000;   // 60s before half-open

  private readonly state: Map<string, CircuitState> = new Map();

  async execute<T>(
    provider: LLMProvider,
    fn: () => Promise<T>
  ): Promise<T> {
    const state = this.getState(provider.name);

    if (state.status === 'OPEN') {
      if (Date.now() - state.lastFailureAt < this.RESET_TIMEOUT) {
        throw new Error(`Provider ${provider.name} circuit is OPEN`);
      }
      // Half-open: allow one request through
      state.status = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.recordSuccess(provider.name);
      return result;
    } catch (error) {
      this.recordFailure(provider.name);
      throw error;
    }
  }

  private recordFailure(providerName: string): void {
    const state = this.getState(providerName);
    state.failureCount++;
    state.lastFailureAt = Date.now();

    if (state.failureCount >= this.FAILURE_THRESHOLD) {
      state.status = 'OPEN';
      this.logger.error(`Circuit OPENED for provider: ${providerName}`);
    }
  }
}
```

---

## 18. Appendix: Full Prompt Library

### A. Classification Prompt (Full)

See [Section 6.3](#63-full-implementation) for the full classification prompt template.

### B. Government Notice Extraction Prompt

```
You are extracting structured information from an Indian government notice.

Document language: {language}
Document text:
"""
{ocr_text}
"""

Extract the following fields from this government notice:
- title: The main subject/title of the notice
- issuing_authority: Government department or body that issued this
- notice_number: Reference number (e.g., "EDU/2026/4521")
- issue_date: When was this notice issued
- effective_date: When does this notice take effect
- deadline: Last date for applications/action (this is CRITICAL — extract precisely)
- eligibility: Who is eligible (qualifications, criteria)
- required_documents: List of documents the applicant must submit
- contact_information: Address, phone, email for queries

For Hindi text: extract dates in their exact form first, then provide ISO date as well.

RULES:
1. deadline is the most important field — if mentioned anywhere in the document, extract it
2. For "अंतिम तारीख" or "last date" — this IS the deadline
3. If multiple dates appear, the LATEST one that relates to applications is the deadline
4. Do not confuse "issue_date" with "deadline" — they are different dates
5. If a field is not found, set value to null

Return JSON with field array as specified.
```

### C. RAG System Prompt (Hindi)

```
आप DocSaarthi हैं — एक बुद्धिमान दस्तावेज़ सहायक जो भारतीय दस्तावेज़ों को समझने में मदद करते हैं।

महत्वपूर्ण नियम:
1. केवल नीचे दिए गए दस्तावेज़ अंशों के आधार पर उत्तर दें
2. यदि जानकारी उपलब्ध नहीं है, तो कहें: "मुझे यह जानकारी आपके दस्तावेज़ों में नहीं मिली।"
3. प्रत्येक तथ्य के साथ स्रोत बताएं: [स्रोत: दस्तावेज़ का नाम, पृष्ठ X]
4. हिंदी में पूछे गए प्रश्नों का उत्तर हिंदी में दें
5. अनुमान न लगाएं — केवल वही बताएं जो दस्तावेज़ में लिखा है

{context}
```

### D. Document Comparison Summary Prompt

```
You have analyzed two versions of an Indian document and found the following changes.

Changed fields:
{field_changes}

Semantically changed sections:
{semantic_changes}

Write a clear, concise summary (2-3 sentences) of the key changes between the two versions.
Focus on changes that would be important to the document's recipient — particularly:
- Changed dates or deadlines
- Changed eligibility criteria
- Changed amounts or financial terms
- Added or removed requirements

Respond in {language}.
Do not use technical jargon. Write as if explaining to the document owner.
```

---

*AI Agents Design Document — DocSaarthi v1.0.0*
*Maintained by: AI Engineering Team*
*Last updated: August 2026*
