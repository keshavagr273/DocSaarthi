import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ExtractedField, OcrBlock, OcrPageResult } from '../stages/pipeline-context';

export interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
  keyIndicators: string[];
}

export interface ExtractionResult {
  fields: ExtractedField[];
  extractionNotes?: string;
}

export interface VisionOcrBlockJson {
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
  blockType?: string;
}

/**
 * LlmService — wrapper around OpenAI for classification, extraction, vision OCR, and embeddings.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly embeddingClient: OpenAI | null;
  private readonly cohereApiKey?: string;
  private readonly embeddingProvider: string;
  private readonly chatModel: string;
  private readonly visionModel: string;
  private readonly embeddingModel: string;
  private readonly embeddingDimension: number;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'] ?? '',
      baseURL: process.env['OPENAI_BASE_URL'] || undefined,
    });

    this.cohereApiKey =
      process.env['COHERE_API_KEY'] ||
      (process.env['EMBEDDING_PROVIDER'] === 'cohere' ? process.env['EMBEDDING_API_KEY'] : undefined);

    this.embeddingProvider = (
      process.env['EMBEDDING_PROVIDER'] || (this.cohereApiKey ? 'cohere' : 'openai')
    ).toLowerCase();

    const embeddingKey = process.env['EMBEDDING_API_KEY'];
    this.embeddingClient =
      this.embeddingProvider === 'openai' && embeddingKey
        ? new OpenAI({
            apiKey: embeddingKey,
            baseURL: process.env['EMBEDDING_BASE_URL'] || undefined,
          })
        : null;

    this.chatModel = process.env['DEFAULT_LLM_MODEL'] ?? 'groq/compound-mini';
    this.visionModel = process.env['DEFAULT_VISION_MODEL'] ?? 'groq/compound-mini';
    this.embeddingModel =
      process.env['DEFAULT_EMBEDDING_MODEL'] ??
      (this.embeddingProvider === 'cohere' ? 'embed-v4.0' : 'text-embedding-3-small');
    this.embeddingDimension = Number(process.env['EMBEDDING_DIMENSION'] ?? 1536);
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getEmbeddingDimension(): number {
    return this.embeddingDimension;
  }

  // ── Classification ────────────────────────────────────────────────

  async classifyDocument(ocrText: string): Promise<ClassificationResult> {
    const snippet = ocrText.slice(0, 2500);

    const prompt = `You are a document classification expert for Indian government, educational, legal, and business documents.

Analyze the following OCR text (which may be in Hindi, English, or mixed) and classify it accurately into exactly one category.

OCR TEXT:
${snippet}

Respond with valid JSON only (no markdown formatting, no text outside JSON):
{
  "category": "<one of: GOVERNMENT_NOTICE, INVOICE, RECEIPT, CERTIFICATE, COLLEGE_DOCUMENT, BANK_DOCUMENT, LEGAL_DOCUMENT, EMPLOYMENT_DOCUMENT, FORM, LETTER, IDENTITY_DOCUMENT, MEDICAL_DOCUMENT, INSURANCE_DOCUMENT, TAX_DOCUMENT, UNKNOWN>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one sentence explanation in English>",
  "key_indicators": ["<key phrase or header found in document>", "<another indicator>"]
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = this.parseJsonSafe<{
        category?: string;
        confidence?: number;
        reasoning?: string;
        key_indicators?: string[];
      }>(content, {});

      return {
        category: parsed.category ?? 'UNKNOWN',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        reasoning: parsed.reasoning ?? '',
        keyIndicators: parsed.key_indicators ?? [],
      };
    } catch (err) {
      this.logger.error(`Classification LLM call failed: ${String(err)}`);
      return { category: 'UNKNOWN', confidence: 0, reasoning: 'LLM error', keyIndicators: [] };
    }
  }

  // ── Vision-Language OCR Fallback ──────────────────────────────────

  /**
   * Extract text and bounding boxes from a document page image using Vision LLM.
   * Used when PaddleOCR confidence is low (< 0.70) or when PaddleOCR is unavailable.
   */
  async extractTextFromVision(
    imageBuffer: Buffer,
    pageNumber: number,
    width = 1000,
    height = 1400,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();

    // Groq models do not support multimodal image input
    const isGroq = (process.env['OPENAI_BASE_URL'] || '').includes('groq.com');
    if (isGroq) {
      this.logger.debug(
        `[Page ${pageNumber}] Vision LLM fallback skipped: Groq does not support multimodal image input`,
      );
      return {
        pageNumber,
        width,
        height,
        blocks: [],
        rawText: '',
        pageConfidence: 0,
        pageLanguage: 'unknown',
        processingTimeMs: Date.now() - startTime,
        fallbackUsed: false,
      };
    }

    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;

    const prompt = `You are a high-accuracy multilingual OCR system specializing in Indian documents (Hindi Devanagari and English).
Examine this image and extract ALL readable text.
Organize the text into structured blocks according to reading order.
For each block, estimate:
1. "text": The exact text transcribed faithfully.
2. "bbox": [x1, y1, x2, y2] bounding box coordinates in pixels, where image width is ${width} and height is ${height}.
3. "confidence": Confidence score between 0.0 and 1.0 (0.95+ for clear printed text, 0.7-0.9 for faint/handwritten).
4. "blockType": "header" | "paragraph" | "table_cell" | "footer" | "signature" | "handwriting".

Also determine if this page contains any handwritten text.

Return JSON in this exact structure:
{
  "containsHandwriting": boolean,
  "language": "hi" | "en" | "hi+en",
  "blocks": [
    {
      "text": "...",
      "bbox": [x1, y1, x2, y2],
      "confidence": 0.95,
      "blockType": "paragraph"
    }
  ]
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: dataUri, detail: 'high' },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2500,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = this.parseJsonSafe<{
        containsHandwriting?: boolean;
        language?: string;
        blocks?: VisionOcrBlockJson[];
      }>(content, {});

      const blocks: OcrBlock[] = (parsed.blocks ?? []).map((b, idx) => ({
        id: `vlm_block_${pageNumber}_${idx}`,
        text: b.text,
        bbox: b.bbox && b.bbox.length === 4 ? b.bbox : [0, idx * 30, width, (idx + 1) * 30],
        confidence: typeof b.confidence === 'number' ? b.confidence : 0.85,
        readingOrder: idx,
        blockType: b.blockType ?? 'paragraph',
      }));

      const rawText = blocks.map((b) => b.text).join('\n');
      const pageConfidence =
        blocks.length > 0
          ? Number((blocks.reduce((s, b) => s + b.confidence, 0) / blocks.length).toFixed(4))
          : 0.8;

      return {
        pageNumber,
        width,
        height,
        blocks,
        rawText,
        pageConfidence,
        pageLanguage: parsed.language ?? 'hi+en',
        processingTimeMs: Date.now() - startTime,
        fallbackUsed: true,
      };
    } catch (err) {
      this.logger.error(`VLM OCR extraction failed for page ${pageNumber}: ${String(err)}`);
      return {
        pageNumber,
        width,
        height,
        blocks: [],
        rawText: '',
        pageConfidence: 0,
        pageLanguage: 'unknown',
        processingTimeMs: Date.now() - startTime,
        fallbackUsed: true,
      };
    }
  }

  /**
   * Refine an individual low-confidence block using cropped image input.
   */
  async refineBlockWithVision(
    cropBuffer: Buffer,
    originalText: string,
  ): Promise<{ text: string; confidence: number }> {
    const isGroq = (process.env['OPENAI_BASE_URL'] || '').includes('groq.com');
    if (isGroq) {
      return { text: originalText, confidence: 0.75 };
    }

    const base64Image = cropBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;

    const prompt = `Transcribe the text in this image crop with extreme precision. The text may be in Hindi (Devanagari) or English.
Initial noisy OCR reading was: "${originalText}".

Return JSON only:
{
  "text": "<corrected transcription>",
  "confidence": <0.0 to 1.0>
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUri, detail: 'low' } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = this.parseJsonSafe<{ text?: string; confidence?: number }>(content, {});
      return {
        text: parsed.text ?? originalText,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
      };
    } catch {
      return { text: originalText, confidence: 0.65 };
    }
  }

  // ── Structured Extraction ─────────────────────────────────────────

  async extractFields(
    ocrText: string,
    category: string,
    language: string,
  ): Promise<ExtractionResult> {
    const schema = this.getExtractionSchema(category);
    const isHindi = language.startsWith('hi');
    const langInstruction = isHindi
      ? 'The document contains Hindi/Devanagari text. Extract the values in their original script (Devanagari or English as present).'
      : 'Extract values accurately as written in the document.';

    const prompt = `You are a high-precision document extraction engine for Indian documents.

${langInstruction}
Document Category: ${category}

Extract all relevant fields according to the schema below.
For each field:
- "fieldName": field identifier (snake_case from schema)
- "fieldType": TEXT | DATE | NUMBER | CURRENCY | LIST | BOOLEAN | ADDRESS | NAME | ID_NUMBER
- "rawValue": exact text extracted from the document
- "confidence": 0.0 to 1.0 based on clarity and certainty in context
- "sourcePage": 1-indexed page number if identifiable, default 1

FIELDS TO EXTRACT:
${schema}

OCR TEXT:
${ocrText.slice(0, 4500)}

Respond with valid JSON only:
{
  "fields": [
    {
      "fieldName": "...",
      "fieldType": "...",
      "rawValue": "...",
      "confidence": 0.95,
      "sourcePage": 1
    }
  ],
  "extractionNotes": "..."
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = this.parseJsonSafe<{
        fields?: Array<{
          fieldName?: string;
          fieldType?: string;
          rawValue?: string;
          confidence?: number;
          sourcePage?: number;
        }>;
        extractionNotes?: string;
      }>(content, {});

      const fields: ExtractedField[] = (parsed.fields ?? [])
        .filter((f) => f.fieldName && f.rawValue && f.rawValue.trim().length > 0)
        .map((f) => ({
          fieldName: f.fieldName!,
          fieldType: (f.fieldType as ExtractedField['fieldType']) ?? 'TEXT',
          rawValue: f.rawValue!.trim(),
          confidence: typeof f.confidence === 'number' ? Math.min(1, Math.max(0, f.confidence)) : 0.5,
          sourcePage: f.sourcePage ?? 1,
          extractionMethod: 'llm',
        }));

      return { fields, extractionNotes: parsed.extractionNotes };
    } catch (err) {
      this.logger.error(`Extraction LLM call failed: ${String(err)}`);
      return { fields: [] };
    }
  }

  // ── Version Semantic Diff ─────────────────────────────────────────

  async compareDocumentVersions(
    v1Fields: Array<{ fieldName: string; rawValue: string }>,
    v2Fields: Array<{ fieldName: string; rawValue: string }>,
    docTitle: string,
  ): Promise<string> {
    const prompt = `Compare two versions of the document "${docTitle}" and provide a clear, concise 2-sentence summary of the key changes.

VERSION 1 FIELDS:
${JSON.stringify(v1Fields, null, 2)}

VERSION 2 FIELDS:
${JSON.stringify(v2Fields, null, 2)}

Respond with valid JSON:
{
  "summary": "<concise 2-sentence summary highlighting critical differences like date changes, amount changes, or updated names>"
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = this.parseJsonSafe<{ summary?: string }>(content, {});
      return parsed.summary ?? 'Document fields updated between versions.';
    } catch {
      return 'Document fields and content updated in the new version.';
    }
  }

  // ── Embeddings ────────────────────────────────────────────────────

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    // 1. Prefer Cohere if configured
    if (this.embeddingProvider === 'cohere' && this.cohereApiKey) {
      try {
        return await this.embedWithCohere(texts, 'search_document');
      } catch (err) {
        this.logger.warn(
          `Cohere embedding failed (${String(err)}). Using deterministic 1536-dim semantic feature vector fallback.`,
        );
        return texts.map((t) => this.generateFallbackEmbedding(t, this.embeddingDimension));
      }
    }

    // 2. OpenAI embedding client fallback
    if (this.embeddingClient) {
      try {
        const response = await this.embeddingClient.embeddings.create({
          model: this.embeddingModel,
          input: texts,
          encoding_format: 'float',
        });

        return response.data
          .sort((a, b) => a.index - b.index)
          .map((item) => new Float32Array(item.embedding));
      } catch (err) {
        this.logger.warn(
          `OpenAI embedding endpoint unavailable (${String(err)}). Using deterministic 1536-dim semantic feature vector fallback.`,
        );
        return texts.map((t) => this.generateFallbackEmbedding(t, this.embeddingDimension));
      }
    }

    // 3. Deterministic local fallback
    this.logger.warn(
      'No remote embedding key configured. Using deterministic 1536-dim semantic feature vector fallback.',
    );
    return texts.map((t) => this.generateFallbackEmbedding(t, this.embeddingDimension));
  }

  private async embedWithCohere(
    texts: string[],
    inputType: 'search_document' | 'search_query',
  ): Promise<Float32Array[]> {
    const BATCH_SIZE = 96;
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.trim() || ' ');

      const response = await fetch('https://api.cohere.com/v2/embed', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cohereApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          texts: batch,
          input_type: inputType,
          embedding_types: ['float'],
          truncate: 'END',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cohere API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        embeddings?: { float?: number[][] };
      };

      const floatEmbeddings = data.embeddings?.float;
      if (!floatEmbeddings || !Array.isArray(floatEmbeddings)) {
        throw new Error('Cohere API response missing embeddings.float array');
      }

      for (const vec of floatEmbeddings) {
        results.push(new Float32Array(vec));
      }
    }

    return results;
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

  // ── Schema registry (All 10 Categories + Special) ─────────────────

  private getExtractionSchema(category: string): string {
    const schemas: Record<string, string> = {
      GOVERNMENT_NOTICE: `
- title (TEXT): The official title/subject of the notice (e.g. छात्रवृत्ति सूचना / Scholarship Notice)
- issuing_authority (NAME): The department, ministry, or authority issuing the notice
- issue_date (DATE): Date of notice issuance (e.g. 15-08-2026 or 15 अगस्त 2026)
- deadline (DATE): Application deadline, last date, or submission date (अंतिम तिथि)
- reference_number (ID_NUMBER): Official letter/notification/file number (ज्ञापांक / पत्रांक)
- subject (TEXT): Detailed subject line or brief summary
- eligibility (TEXT): Eligibility criteria, qualifications, or requirements
- contact_info (TEXT): Official helpline, email, or portal URL`,

      INVOICE: `
- invoice_number (ID_NUMBER): Invoice / bill number (e.g. INV-2026-001)
- invoice_date (DATE): Date of the invoice
- vendor_name (NAME): Seller or supplier company/individual name
- vendor_gstin (ID_NUMBER): 15-character GSTIN of the vendor
- buyer_name (NAME): Buyer / customer company or individual name
- buyer_gstin (ID_NUMBER): 15-character GSTIN of the buyer (if available)
- subtotal (CURRENCY): Taxable amount before taxes
- tax_amount (CURRENCY): Total CGST + SGST or IGST amount
- total_amount (CURRENCY): Final payable amount including taxes
- payment_due_date (DATE): Due date for payment (if specified)
- items (LIST): Summary list of purchased goods/services with quantities`,

      RECEIPT: `
- merchant (NAME): Merchant, store, clinic, or payee name
- date (DATE): Transaction date
- total_amount (CURRENCY): Total amount paid (कुल राशि)
- payment_method (TEXT): Payment mode: Cash, UPI, Card, NetBanking
- receipt_number (ID_NUMBER): Receipt, transaction ID, or UTR number
- items (LIST): List of items or service charges`,

      CERTIFICATE: `
- holder_name (NAME): Name of the recipient / certificate holder
- cert_type (TEXT): Type of certificate (e.g., Degree, Caste, Income, Domicile, Training)
- cert_number (ID_NUMBER): Certificate / registration number
- issue_date (DATE): Date the certificate was issued
- expiry_date (DATE): Expiry date or validity period (if applicable)
- issuing_authority (NAME): Authority, university, officer, or board that issued it
- course_or_achievement (TEXT): Course title, grade, achievement, or reason for certificate`,

      COLLEGE_DOCUMENT: `
- institution (NAME): College, school, or university name
- student_name (NAME): Student full name
- roll_number (ID_NUMBER): Roll number, enrollment number, or registration ID
- document_type (TEXT): Marksheet, admit card, fee receipt, degree, or character certificate
- academic_year (TEXT): Semester, class, or academic year (e.g., 2025-2026)
- programme (TEXT): Degree or course name (e.g., B.Tech, B.Sc, Intermediate)
- marks_or_grades (TEXT): Total marks, percentage, CGPA, or division obtained
- date (DATE): Date of issuance`,

      BANK_DOCUMENT: `
- account_holder (NAME): Account holder name(s)
- account_number (ID_NUMBER): Bank account number (masked or full)
- bank_name (NAME): Bank name (e.g., State Bank of India, HDFC Bank)
- ifsc_code (ID_NUMBER): 11-character IFSC code
- branch (TEXT): Branch name and city
- statement_period (TEXT): Date range covered by the statement
- opening_balance (CURRENCY): Opening balance amount
- closing_balance (CURRENCY): Closing / current balance amount`,

      LEGAL_DOCUMENT: `
- parties (LIST): Names of petitioner(s), respondent(s), buyer(s), or seller(s)
- court (NAME): Name of court, tribunal, or registrar office
- case_number (ID_NUMBER): Case number, petition number, or deed registration number
- date (DATE): Document or order date
- subject (TEXT): Brief subject or title of the legal matter
- jurisdiction (TEXT): Jurisdiction or state/district
- summary (TEXT): Core ruling, agreement terms, or prayer`,

      EMPLOYMENT_DOCUMENT: `
- employee_name (NAME): Full name of the employee
- employer_name (NAME): Company, organization, or department name
- designation (TEXT): Job title, designation, or role
- date (DATE): Document date
- joining_date (DATE): Date of joining or appointment
- ctc (CURRENCY): Salary, CTC, stipend, or basic pay mentioned
- document_type (TEXT): Offer letter, payslip, experience letter, or relieving letter`,

      FORM: `
- form_name (TEXT): Title or heading of the form (e.g., Application Form, Registration Form)
- form_number (ID_NUMBER): Form reference or application number
- date (DATE): Date filled or submitted
- applicant_name (NAME): Full name of the applicant
- key_fields (LIST): Up to 5 most important filled field values
- submission_office (TEXT): Office or portal where form is to be submitted`,

      LETTER: `
- sender (NAME): Sender name, designation, or organization
- recipient (NAME): Recipient name, designation, or department
- date (DATE): Date of the letter
- subject (TEXT): Subject line (विषय)
- reference (ID_NUMBER): Letter reference number or tracking ID
- summary (TEXT): 1-2 sentence core message of the letter`,

      IDENTITY_DOCUMENT: `
- full_name (NAME): Full legal name as printed on ID
- id_number (ID_NUMBER): Document/card number
- date_of_birth (DATE): Date of birth
- gender (TEXT): Gender
- address (ADDRESS): Full address printed on the ID
- issue_date (DATE): Date of issue
- expiry_date (DATE): Expiry date (if applicable)`,

      TAX_DOCUMENT: `
- pan (ID_NUMBER): Permanent Account Number (PAN)
- assessment_year (TEXT): Assessment year (e.g. 2026-27)
- tax_payable (CURRENCY): Tax amount payable or refund due
- gross_income (CURRENCY): Gross total income
- filing_date (DATE): Date of filing or acknowledgment`,

      UNKNOWN: `
- document_title (TEXT): Heading or title of the document
- date (DATE): Primary date found in the document
- reference_number (ID_NUMBER): Any identification or reference code
- key_entity (NAME): Primary person, company, or authority mentioned
- summary (TEXT): Concise summary of what this document is about`,
    };

    return schemas[category] ?? schemas['UNKNOWN']!;
  }

  private parseJsonSafe<T>(rawContent: string, fallback: T): T {
    try {
      let cleaned = rawContent.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }
      return JSON.parse(cleaned) as T;
    } catch {
      return fallback;
    }
  }
}
