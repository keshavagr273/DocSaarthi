import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { LlmService } from '../services/llm.service';
import type { PipelineContext, ExtractedField } from './pipeline-context';
import type { DocumentProcessingJobData } from './pipeline-context';

/**
 * Stage 9: STRUCTURED_EXTRACTION
 *
 * Calls the LLM with a category-specific schema to extract structured fields.
 * Creates document_fields and document_version_fields records.
 */
@Injectable()
export class StructuredExtractionStage extends BaseStage {
  protected readonly stageName = ProcessingStage.STRUCTURED_EXTRACTION;
  protected readonly logger = new Logger(StructuredExtractionStage.name);

  constructor(
    db: DatabaseService,
    private readonly llm: LlmService,
  ) {
    super(db);
  }

  /** Stage 10 cross-references ctx.extractedFields when rescoring. */
  async rehydrate(ctx: PipelineContext): Promise<void> {
    if (ctx.extractedFields) return;

    const rows = await this.db.documentField.findMany({
      where: { documentId: ctx.documentId, isRejected: false },
      select: {
        fieldName: true,
        fieldType: true,
        rawValue: true,
        confidence: true,
        sourcePage: true,
        extractionMethod: true,
      },
    });

    ctx.extractedFields = rows.map((row) => ({
      fieldName: row.fieldName,
      fieldType: row.fieldType as ExtractedField['fieldType'],
      rawValue: row.rawValue,
      confidence: row.confidence,
      sourcePage: row.sourcePage ?? undefined,
      extractionMethod: row.extractionMethod ?? undefined,
    }));

    this.logger.debug(
      `[${ctx.documentId}] Rehydrated ${ctx.extractedFields.length} extracted fields from DB`,
    );
  }

  async execute(
    ctx: PipelineContext,
    job: Job<DocumentProcessingJobData>,
  ): Promise<void> {
    this.logger.log(
      `[${ctx.documentId}] Stage 9: STRUCTURED_EXTRACTION (category=${ctx.category})`,
    );
    this.markStageProcessing(ctx.versionId, ctx);
    await this.reportProgress(job, 60);

    const text = ctx.normalizedText ?? '';
    const category = ctx.category ?? 'UNKNOWN';
    const language = ctx.primaryLanguage ?? 'en';

    if (!text.trim()) {
      // Extraction against an empty string returns nothing but still reports
      // success, which looks identical to "this document has no fields".
      this.logger.warn(
        `[${ctx.documentId}] Stage 9: no normalized text available — skipping extraction. ` +
        `OCR produced ${(ctx.ocrResults ?? []).length} pages.`,
      );
    }

    const { fields, error: extractionError } = await this.llm.extractFields(text, category, language);

    if (extractionError) {
      // Same reasoning as classification: "provider unreachable" must not be
      // recorded as "this document has no fields".
      await this.markStageFailed(
        ctx.versionId,
        'LLM_UNAVAILABLE',
        `Extraction provider error: ${extractionError}`,
        ctx,
      );
      throw new Error(`LLM_UNAVAILABLE: field extraction failed — ${extractionError}`);
    }

    // ── Clear previous extractions, keeping human work ──────────
    // DocumentField rows are per-document, not per-version, and the review UI
    // writes a user's corrections straight into them (isVerified = true,
    // confidence = 1.0). A blanket deleteMany here silently destroyed every
    // correction a user had made whenever the document was retried or a new
    // version was uploaded. Keep verified and explicitly-rejected rows, and
    // don't re-extract the fields they cover.
    const preserved = await this.db.documentField.findMany({
      where: {
        documentId: ctx.documentId,
        OR: [{ isVerified: true }, { isRejected: true }],
      },
      select: { fieldName: true, isVerified: true },
    });
    const preservedNames = new Set(preserved.map((f) => f.fieldName));

    await this.db.documentField.deleteMany({
      where: {
        documentId: ctx.documentId,
        isVerified: false,
        isRejected: false,
      },
    });
    await this.db.documentVersionField.deleteMany({ where: { versionId: ctx.versionId } });

    if (preservedNames.size > 0) {
      this.logger.log(
        `[${ctx.documentId}] Stage 9: preserving ${preservedNames.size} human-reviewed field(s): ` +
        `${[...preservedNames].join(', ')}`,
      );
    }

    const createdFields: ExtractedField[] = [];
    // Use explicit Prisma input types — Parameters<createMany>[0] is optional so .data would be unsafe
    const fieldCreateData: {
      documentId: string; fieldName: string; fieldType: never; rawValue: string;
      confidence: number; confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'; sourcePage: number | null;
      extractionMethod: string; isVerified: boolean; isRejected: boolean;
    }[] = [];
    const versionFieldCreateData: {
      versionId: string; fieldName: string; fieldType: never; rawValue: string;
      confidence: number; sourcePage: number | null; extractionMethod: string;
    }[] = [];

    const seenNames = new Set<string>();

    for (const field of fields) {
      const rawStr = String(field.rawValue ?? '').trim();
      if (!rawStr) continue; // skip empty extractions

      // Never overwrite a field a human already settled.
      if (preservedNames.has(field.fieldName)) continue;

      // The model occasionally emits the same field twice; a duplicate would
      // create two rows and make Stage 10's fieldName lookup ambiguous.
      if (seenNames.has(field.fieldName)) continue;
      seenNames.add(field.fieldName);

      fieldCreateData.push({
        documentId: ctx.documentId,
        fieldName: field.fieldName,
        fieldType: field.fieldType as never,
        rawValue: rawStr,
        confidence: field.confidence,
        confidenceLevel: this.toConfidenceLevel(field.confidence),
        sourcePage: field.sourcePage ?? null,
        extractionMethod: 'llm',
        isVerified: false,
        isRejected: false,
      });

      versionFieldCreateData.push({
        versionId: ctx.versionId,
        fieldName: field.fieldName,
        fieldType: field.fieldType as never,
        // Use the trimmed value, same as the documentField row — the two
        // tables were storing different strings for the same extraction.
        rawValue: rawStr,
        confidence: field.confidence,
        sourcePage: field.sourcePage ?? null,
        extractionMethod: 'llm',
      });

      createdFields.push(field);
    }

    // Bulk insert — replaces N sequential create() round-trips with 2 queries
    if (fieldCreateData.length > 0) {
      await this.db.documentField.createMany({ data: fieldCreateData });
      await this.db.documentVersionField.createMany({ data: versionFieldCreateData });
    }

    ctx.extractedFields = createdFields;

    this.markStageCompleted(ctx.versionId, ctx);
    this.logger.log(
      `[${ctx.documentId}] Stage 9 DONE — extracted ${createdFields.length} fields | ` +
      `category=${ctx.category} | lang=${ctx.primaryLanguage}`,
    );

    if (createdFields.length > 0) {
      const colW = Math.max(...createdFields.map((f) => f.fieldName.length), 12);
      const fieldLines = createdFields.map((f) =>
        `  ${f.fieldName.padEnd(colW)}  [${f.fieldType.padEnd(10)}]  ` +
        `${(f.confidence * 100).toFixed(0)}%  "${String(f.rawValue).substring(0, 60)}"`
      );
      this.logger.log(
        `[${ctx.documentId}] Stage 9 EXTRACTED FIELDS:\n` +
        `  ${'FIELD'.padEnd(colW)}  TYPE            CONF  VALUE\n` +
        `  ${'\u2500'.repeat(colW + 40)}\n` +
        fieldLines.join('\n'),
      );
    } else {
      this.logger.warn(`[${ctx.documentId}] Stage 9: No fields extracted — check LLM prompt/schema for category=${ctx.category}`);
    }
  }

  private toConfidenceLevel(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (confidence >= 0.85) return 'HIGH';
    if (confidence >= 0.65) return 'MEDIUM';
    return 'LOW';
  }
}
