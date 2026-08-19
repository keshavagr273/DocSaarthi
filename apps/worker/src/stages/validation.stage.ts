import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import type { PipelineContext } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

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
 * Stage 11: VALIDATION
 *
 * Per-field type validation:
 * - DATE: attempt multi-format parsing, store normalizedValue as ISO date
 * - CURRENCY: strip symbols, verify numeric
 * - ID_NUMBER GSTIN: validate 15-char pattern
 * - Date logic: deadline before issue_date → flag as LOW confidence
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
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 72);

    const dbFields = await this.db.documentField.findMany({
      where: { documentId: ctx.documentId, isRejected: false },
    });

    // Store parsed dates for cross-field validation
    const parsedDates: Record<string, Date | null> = {};

    for (const field of dbFields) {
      let newConfidence = field.confidence;
      let normalizedValue: unknown = null;

      if (field.fieldType === 'DATE') {
        const parsed = this.parseDate(field.rawValue);
        if (parsed) {
          normalizedValue = parsed.toISOString().split('T')[0]; // YYYY-MM-DD
          parsedDates[field.fieldName] = parsed;
        } else {
          newConfidence = Math.min(field.confidence, 0.40);
          parsedDates[field.fieldName] = null;
        }
      } else if (field.fieldType === 'CURRENCY') {
        const numeric = this.parseCurrency(field.rawValue);
        if (numeric !== null) {
          normalizedValue = numeric;
        } else {
          newConfidence = Math.min(field.confidence, 0.40);
        }
      } else if (field.fieldType === 'ID_NUMBER') {
        // GSTIN validation
        if (this.looksLikeGstin(field.rawValue)) {
          if (this.isValidGstin(field.rawValue)) {
            newConfidence = Math.min(1.0, field.confidence + 0.1);
            normalizedValue = field.rawValue.toUpperCase().trim();
          } else {
            newConfidence = Math.min(field.confidence, 0.30);
          }
        }
      }

      // Update field in DB
      await this.db.documentField.update({
        where: { id: field.id },
        data: {
          normalizedValue: normalizedValue ?? undefined,
          confidence: newConfidence,
          confidenceLevel: this.toLevel(newConfidence) as never,
        },
      });
    }

    // Cross-field validation: deadline should be after issue_date
    await this.crossValidateDates(ctx.documentId, parsedDates);

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(`[${ctx.documentId}] Stage 11 DONE — validated ${dbFields.length} fields`);
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
    // "20 August 2026" or "20 Aug 2026"
    const m = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/i);
    if (!m) return null;
    const monthNum = ENGLISH_MONTHS[m[2]!.toLowerCase()];
    if (!monthNum) return null;
    return new Date(parseInt(m[3]!), monthNum - 1, parseInt(m[1]!));
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
    // Strip Rs., ₹, commas, spaces
    const cleaned = raw.replace(/Rs\.?\s*|₹\s*|,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  // ── GSTIN validation ─────────────────────────────────────────────

  private looksLikeGstin(raw: string): boolean {
    return /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}/.test(raw.toUpperCase().trim());
  }

  private isValidGstin(raw: string): boolean {
    const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;
    return GSTIN_REGEX.test(raw.toUpperCase().trim());
  }

  // ── Cross-field date validation ───────────────────────────────────

  private async crossValidateDates(
    documentId: string,
    parsedDates: Record<string, Date | null>,
  ): Promise<void> {
    const issueDate = parsedDates['issue_date'] ?? parsedDates['invoice_date'] ?? parsedDates['date'];
    const deadline = parsedDates['deadline'] ?? parsedDates['payment_due_date'] ?? parsedDates['expiry_date'];

    if (issueDate && deadline && deadline <= issueDate) {
      this.logger.warn(
        `[${documentId}] Cross-validation: deadline (${deadline.toISOString()}) is before issue_date (${issueDate.toISOString()})`,
      );

      // Reduce deadline confidence
      const deadlineFieldName = parsedDates['deadline'] ? 'deadline'
        : parsedDates['payment_due_date'] ? 'payment_due_date'
        : 'expiry_date';

      await this.db.documentField.updateMany({
        where: { documentId, fieldName: deadlineFieldName },
        data: {
          confidence: 0.40,
          confidenceLevel: 'LOW',
        },
      });
    }
  }

  private toLevel(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (confidence >= 0.85) return 'HIGH';
    if (confidence >= 0.65) return 'MEDIUM';
    return 'LOW';
  }
}
