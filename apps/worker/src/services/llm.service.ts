import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ExtractedField } from '../stages/pipeline-context';

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

/**
 * LlmService — wrapper around OpenAI for classification, extraction, and embeddings.
 *
 * Uses gpt-4o-mini for text tasks and text-embedding-3-small for embeddings.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'] ?? '',
    });
    this.chatModel = process.env['DEFAULT_LLM_MODEL'] ?? 'gpt-4o-mini';
    this.embeddingModel = process.env['DEFAULT_EMBEDDING_MODEL'] ?? 'text-embedding-3-small';
  }

  // ── Classification ────────────────────────────────────────────────

  async classifyDocument(ocrText: string): Promise<ClassificationResult> {
    const snippet = ocrText.slice(0, 2000);

    const prompt = `You are a document classification expert for Indian government and business documents.

Analyze the following OCR text from a document and classify it.

OCR TEXT:
${snippet}

Respond with valid JSON only (no markdown, no explanation outside JSON):
{
  "category": "<one of: GOVERNMENT_NOTICE, INVOICE, RECEIPT, CERTIFICATE, COLLEGE_DOCUMENT, BANK_DOCUMENT, LEGAL_DOCUMENT, EMPLOYMENT_DOCUMENT, FORM, LETTER, IDENTITY_DOCUMENT, MEDICAL_DOCUMENT, INSURANCE_DOCUMENT, TAX_DOCUMENT, UNKNOWN>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one sentence explanation>",
  "key_indicators": ["<phrase1>", "<phrase2>"]
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as {
        category?: string;
        confidence?: number;
        reasoning?: string;
        key_indicators?: string[];
      };

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

  // ── Structured Extraction ─────────────────────────────────────────

  async extractFields(
    ocrText: string,
    category: string,
    language: string,
  ): Promise<ExtractionResult> {
    const schema = this.getExtractionSchema(category);
    const langHint = language.startsWith('hi') ? 'The document is primarily in Hindi.' : '';

    const prompt = `You are an expert at extracting structured data from Indian documents.

${langHint}
Document category: ${category}

Extract the following fields from the OCR text. For each field, provide:
- fieldName: the field identifier (snake_case)
- fieldType: one of TEXT, DATE, NUMBER, CURRENCY, LIST, BOOLEAN, ADDRESS, NAME, ID_NUMBER
- rawValue: the exact value as found in the document
- confidence: 0.0-1.0 (your confidence that the value is correct)
- sourcePage: page number where this field was found (1-indexed)

Fields to extract:
${schema}

OCR TEXT (truncated to 3000 chars):
${ocrText.slice(0, 3000)}

Respond with valid JSON only:
{
  "fields": [
    {
      "fieldName": "...",
      "fieldType": "...",
      "rawValue": "...",
      "confidence": 0.0,
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
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as {
        fields?: Array<{
          fieldName?: string;
          fieldType?: string;
          rawValue?: string;
          confidence?: number;
          sourcePage?: number;
        }>;
        extractionNotes?: string;
      };

      const fields: ExtractedField[] = (parsed.fields ?? [])
        .filter((f) => f.fieldName && f.rawValue)
        .map((f) => ({
          fieldName: f.fieldName!,
          fieldType: (f.fieldType as ExtractedField['fieldType']) ?? 'TEXT',
          rawValue: f.rawValue!,
          confidence: typeof f.confidence === 'number' ? f.confidence : 0.5,
          sourcePage: f.sourcePage ?? 1,
          extractionMethod: 'llm',
        }));

      return { fields, extractionNotes: parsed.extractionNotes };
    } catch (err) {
      this.logger.error(`Extraction LLM call failed: ${String(err)}`);
      return { fields: [] };
    }
  }

  // ── Embeddings ────────────────────────────────────────────────────

  /**
   * Generate embeddings for a batch of text strings.
   * Returns Float32Array[] in same order as inputs.
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: texts,
        encoding_format: 'float',
      });

      return response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => new Float32Array(item.embedding));
    } catch (err) {
      this.logger.error(`Embedding API call failed: ${String(err)}`);
      throw err;
    }
  }

  // ── Schema registry ───────────────────────────────────────────────

  private getExtractionSchema(category: string): string {
    const schemas: Record<string, string> = {
      GOVERNMENT_NOTICE: `
- title (TEXT): The official title of the notice
- issuing_authority (TEXT): The government department or authority issuing the notice
- issue_date (DATE): The date the notice was issued
- deadline (DATE): Any deadline or due date mentioned
- reference_number (ID_NUMBER): Notice/order reference number
- subject (TEXT): Subject line or brief description
- eligibility (TEXT): Any eligibility criteria mentioned`,

      INVOICE: `
- invoice_number (ID_NUMBER): Invoice/bill number
- invoice_date (DATE): Date of invoice
- vendor_name (NAME): Seller/vendor company name
- vendor_gstin (ID_NUMBER): Vendor GSTIN (15-char alphanumeric)
- buyer_name (NAME): Buyer/customer name
- buyer_gstin (ID_NUMBER): Buyer GSTIN if present
- subtotal (CURRENCY): Amount before tax
- tax_amount (CURRENCY): Total tax/GST amount
- total_amount (CURRENCY): Final total amount
- payment_due_date (DATE): Payment due date if mentioned`,

      RECEIPT: `
- merchant (NAME): Merchant or store name
- date (DATE): Date of transaction
- total_amount (CURRENCY): Total amount paid
- payment_method (TEXT): Cash, card, UPI, etc.
- items (LIST): List of items purchased (comma-separated)
- receipt_number (ID_NUMBER): Receipt or transaction ID`,

      CERTIFICATE: `
- holder_name (NAME): Name of certificate holder
- cert_type (TEXT): Type of certificate
- cert_number (ID_NUMBER): Certificate number
- issue_date (DATE): Date of issuance
- expiry_date (DATE): Expiry date if applicable
- issuing_authority (NAME): Organization that issued the certificate
- course_or_achievement (TEXT): What the certificate is for`,

      COLLEGE_DOCUMENT: `
- institution (NAME): College/university name
- student_name (NAME): Student full name
- roll_number (ID_NUMBER): Roll number or student ID
- document_type (TEXT): Marksheet, admit card, transcript, etc.
- academic_year (TEXT): Academic year or semester
- programme (TEXT): Degree/programme name
- date (DATE): Date of document`,

      BANK_DOCUMENT: `
- account_holder (NAME): Account holder name
- account_number (ID_NUMBER): Bank account number (masked is fine)
- bank_name (NAME): Bank name
- branch (TEXT): Branch name
- statement_period (TEXT): Date range of statement
- opening_balance (CURRENCY): Opening balance
- closing_balance (CURRENCY): Closing balance`,

      LEGAL_DOCUMENT: `
- parties (LIST): Names of all parties involved
- court (NAME): Court name if applicable
- case_number (ID_NUMBER): Case number
- date (DATE): Document date
- subject (TEXT): Brief subject of the legal matter
- jurisdiction (TEXT): Jurisdiction or location`,

      EMPLOYMENT_DOCUMENT: `
- employee_name (NAME): Employee full name
- employer_name (NAME): Company/organization name
- designation (TEXT): Job title/designation
- date (DATE): Document date
- joining_date (DATE): Date of joining if mentioned
- ctc (CURRENCY): CTC or salary if mentioned`,

      LETTER: `
- sender (NAME): Sender name or organization
- recipient (NAME): Recipient name or designation
- date (DATE): Date of letter
- subject (TEXT): Subject of the letter
- summary (TEXT): 1-2 sentence summary of key content`,

      FORM: `
- form_name (TEXT): Name or type of form
- form_number (ID_NUMBER): Form number/code
- date (DATE): Date filled
- applicant_name (NAME): Name of person filling the form
- key_fields (LIST): Up to 5 most important filled fields`,

      UNKNOWN: `
- document_title (TEXT): Title or heading of document
- date (DATE): Any date found in the document
- reference_number (ID_NUMBER): Any reference number found
- key_entity (NAME): Primary person or organization name
- summary (TEXT): Brief description of what this document appears to be`,
    };

    return schemas[category] ?? schemas['UNKNOWN']!;
  }
}
