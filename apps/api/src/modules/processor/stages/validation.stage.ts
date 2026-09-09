import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../document.processor';

// Hindi month names → month number mapping
const HINDI_MONTHS: Record<string, number> = {
  जनवरी: 1,
  फ़रवरी: 2,
  फरवरी: 2,
  मार्च: 3,
  अप्रैल: 4,
  मई: 5,
  जून: 6,
  जुलाई: 7,
  अगस्त: 8,
  सितंबर: 9,
  अक्टूबर: 10,
  नवंबर: 11,
  दिसंबर: 12,
};

// English month names → month number
const ENGLISH_MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Stage 11: VALIDATION & CROSS-FIELD CONSISTENCY
 *
 * Checkpoint 3 enhancements:
 * - Date parsing (standard formats + Hindi Devanagari dates)
 * - Currency normalization + anomaly detection (negatives, >10Cr)
 * - GSTIN 15-character validation with confidence adjustments
 * - Cross-field consistency:
 *   - Invoice math verification: subtotal + tax_amount ≈ total_amount (within 5%)
 *   - Chronological validation: deadline/due_date >= issue_date
 *   - Certificate validity: expiry_date >= issue_date
 */
@Injectable()
export class ValidationStage extends BaseStage {
  protected readonly stageName = ProcessingStage.VALIDATION;
  protected readonly logger = new Logger(ValidationStage.name);

  constructor(db: DatabaseService) {
    super(db);
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(`[${ctx.documentId}] Stage 11: VALIDATION`);
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 72);

    const dbFields = await this.db.documentField.findMany({
      where: { documentId: ctx.documentId, isRejected: false },
    });

    const parsedDates: Record<string, Date | null> = {};
    const parsedCurrencies: Record<string, number | null> = {};
    const updatePromises: Promise<unknown>[] = [];

    for (const field of dbFields) {
      let newConfidence = field.confidence;
      let normalizedValue: unknown = null;

      // ── 1. Date Validation ─────────────────────────────────────────
      if (field.fieldType === 'DATE') {
        const parsed = this.parseDate(field.rawValue);
        if (parsed) {
          normalizedValue = parsed.toISOString().split('T')[0]; // YYYY-MM-DD
          parsedDates[field.fieldName] = parsed;
        } else {
          newConfidence = Math.min(field.confidence, 0.40);
          parsedDates[field.fieldName] = null;
        }
      }

      // ── 2. Currency Validation ─────────────────────────────────────
      else if (field.fieldType === 'CURRENCY') {
        const numeric = this.parseCurrency(field.rawValue);
        if (numeric !== null) {
          normalizedValue = numeric;
          parsedCurrencies[field.fieldName] = numeric;

          // Check anomalies
          if (numeric < 0) {
            newConfidence = Math.max(0.1, newConfidence - 0.25);
          } else if (numeric > 100_000_000) {
            // Unusually large (> 10 Crore) — mark for human review
            newConfidence = Math.min(newConfidence, 0.60);
          }
        } else {
          newConfidence = Math.min(field.confidence, 0.40);
          parsedCurrencies[field.fieldName] = null;
        }
      }

      // ── 3. ID / GSTIN Validation ───────────────────────────────────
      else if (field.fieldType === 'ID_NUMBER' || field.fieldName.includes('gstin')) {
        if (this.looksLikeGstin(field.rawValue)) {
          if (this.isValidGstin(field.rawValue)) {
            newConfidence = Math.min(1.0, field.confidence + 0.1);
            normalizedValue = field.rawValue.toUpperCase().trim();
          } else {
            newConfidence = Math.min(field.confidence, 0.30);
          }
        }
      }

      const clampedConfidence = Math.min(1.0, Math.max(0.0, newConfidence));
      const confidenceLevel = this.toLevel(clampedConfidence);

      updatePromises.push(
        this.db.documentField.update({
          where: { id: field.id },
          data: {
            normalizedValue: normalizedValue !== null ? (normalizedValue as never) : undefined,
            confidence: clampedConfidence,
            confidenceLevel: confidenceLevel as never,
          },
        }),
      );
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // ── 4. Cross-Field Validations ──────────────────────────────────
    await this.crossValidateDates(ctx.documentId, parsedDates);
    await this.crossValidateInvoiceMath(ctx.documentId, parsedCurrencies);

    this.markStageCompleted(ctx.versionId, ctx);
    this.logger.log(
      `[${ctx.documentId}] Stage 11 DONE — validated ${dbFields.length} fields | ` +
      `dates=${Object.keys(parsedDates).length} | currencies=${Object.keys(parsedCurrencies).length}`,
    );

    const validationLines: string[] = [];
    for (const field of dbFields) {
      if (field.fieldType === 'DATE') {
        const parsed = parsedDates[field.fieldName];
        validationLines.push(
          `  [DATE]     ${field.fieldName}: "${field.rawValue}" → ${parsed ? parsed.toISOString().split('T')[0] : 'PARSE_FAILED'}`,
        );
      } else if (field.fieldType === 'CURRENCY') {
        const parsed = parsedCurrencies[field.fieldName];
        validationLines.push(
          `  [CURRENCY] ${field.fieldName}: "${field.rawValue}" → ${parsed !== null && parsed !== undefined ? parsed : 'PARSE_FAILED'}`,
        );
      } else if (field.fieldType === 'ID_NUMBER') {
        const isGstin = this.looksLikeGstin(field.rawValue);
        validationLines.push(
          `  [ID]       ${field.fieldName}: "${field.rawValue}" → gstin=${isGstin ? (this.isValidGstin(field.rawValue) ? 'VALID' : 'INVALID') : 'n/a'}`,
        );
      }
    }
    if (validationLines.length > 0) {
      this.logger.debug(
        `[${ctx.documentId}] Stage 11 VALIDATION DETAILS:\n` + validationLines.join('\n'),
      );
    }
  }

  // ── Date parsing ─────────────────────────────────────────────────

  private parseDate(raw: string): Date | null {
    if (!raw) return null;
    const s = raw.trim();

    const formats: Array<(str: string) => Date | null> = [
      this.parseDDMMYYYY,
      this.parseYYYYMMDD,
      this.parseNaturalDate.bind(this),
      this.parseHindiDate.bind(this),
    ];

    for (const fmt of formats) {
      const d = fmt(s);
      if (d && !isNaN(d.getTime())) return d;
    }
    return null;
  }

  private parseDDMMYYYY(s: string): Date | null {
    const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (!m) return null;
    return new Date(parseInt(m[3]!), parseInt(m[2]!) - 1, parseInt(m[1]!));
  }

  private parseYYYYMMDD(s: string): Date | null {
    const m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (!m) return null;
    return new Date(parseInt(m[1]!), parseInt(m[2]!) - 1, parseInt(m[3]!));
  }

  private parseNaturalDate(s: string): Date | null {
    // "20 August 2026" or "20 Aug 2026" or "Aug 20, 2026"
    const m = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/i);
    if (m) {
      const monthNum = ENGLISH_MONTHS[m[2]!.toLowerCase()];
      if (monthNum) return new Date(parseInt(m[3]!), monthNum - 1, parseInt(m[1]!));
    }
    const m2 = s.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (m2) {
      const monthNum = ENGLISH_MONTHS[m2[1]!.toLowerCase()];
      if (monthNum) return new Date(parseInt(m2[3]!), monthNum - 1, parseInt(m2[2]!));
    }
    return null;
  }

  private parseHindiDate(s: string): Date | null {
    // "20 अगस्त 2026"
    for (const [monthName, monthNum] of Object.entries(HINDI_MONTHS)) {
      if (s.includes(monthName)) {
        const m = s.match(/(\d{1,2})\D+(\d{4})/);
        if (m) {
          return new Date(parseInt(m[2]!), monthNum - 1, parseInt(m[1]!));
        }
      }
    }
    return null;
  }

  // ── Currency parsing ─────────────────────────────────────────────

  private parseCurrency(raw: string): number | null {
    const cleaned = raw.replace(/INR|Rs\.?|₹|\s|,/gi, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  // ── GSTIN validation ─────────────────────────────────────────────

  private looksLikeGstin(raw: string): boolean {
    const cleaned = raw.toUpperCase().trim();
    return /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}/.test(cleaned);
  }

  private isValidGstin(raw: string): boolean {
    const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;
    return GSTIN_REGEX.test(raw.toUpperCase().trim());
  }

  // ── Cross-field Date Validation ───────────────────────────────────

  private async crossValidateDates(
    documentId: string,
    parsedDates: Record<string, Date | null>,
  ): Promise<void> {
    const issueDate = parsedDates['issue_date'] ?? parsedDates['invoice_date'] ?? parsedDates['date'];
    const deadline = parsedDates['deadline'] ?? parsedDates['payment_due_date'] ?? parsedDates['expiry_date'];

    if (issueDate && deadline && deadline < issueDate) {
      this.logger.warn(
        `[${documentId}] Chronological conflict: deadline (${deadline.toISOString()}) is before issue date (${issueDate.toISOString()})`,
      );

      const targetField = parsedDates['deadline']
        ? 'deadline'
        : parsedDates['payment_due_date']
        ? 'payment_due_date'
        : 'expiry_date';

      await this.db.documentField.updateMany({
        where: { documentId, fieldName: targetField },
        data: {
          confidence: 0.35,
          confidenceLevel: 'LOW',
        },
      });
    }
  }

  // ── Cross-field Invoice Math Validation ──────────────────────────

  private async crossValidateInvoiceMath(
    documentId: string,
    parsedCurrencies: Record<string, number | null>,
  ): Promise<void> {
    const subtotal = parsedCurrencies['subtotal'];
    const tax = parsedCurrencies['tax_amount'];
    const total = parsedCurrencies['total_amount'];

    if (subtotal !== null && subtotal !== undefined && tax !== null && tax !== undefined && total !== null && total !== undefined) {
      const expectedTotal = subtotal + tax;
      const difference = Math.abs(expectedTotal - total);
      const tolerance = total * 0.05; // 5% rounding / discount tolerance

      if (difference > tolerance && difference > 5) {
        this.logger.warn(
          `[${documentId}] Invoice math mismatch: subtotal(${subtotal}) + tax(${tax}) = ${expectedTotal} != total(${total})`,
        );

        // Reduce confidence of total_amount and tax_amount
        await this.db.documentField.updateMany({
          where: {
            documentId,
            fieldName: { in: ['total_amount', 'tax_amount'] },
          },
          data: {
            confidence: 0.45,
            confidenceLevel: 'LOW',
          },
        });
      }
    }
  }

  private toLevel(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (confidence >= 0.85) return 'HIGH';
    if (confidence >= 0.65) return 'MEDIUM';
    return 'LOW';
  }
}
