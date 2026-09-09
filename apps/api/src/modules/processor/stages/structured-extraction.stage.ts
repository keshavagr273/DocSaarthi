import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { LlmService } from '../services/llm.service';
import type { PipelineContext, ExtractedField } from './pipeline-context';
import type { DocumentProcessingJobData } from '../document.processor';

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

    const { fields } = await this.llm.extractFields(text, category, language);

    // Delete any existing fields for this document (idempotency on retry)
    await this.db.documentField.deleteMany({ where: { documentId: ctx.documentId } });
    await this.db.documentVersionField.deleteMany({ where: { versionId: ctx.versionId } });

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

    for (const field of fields) {
      if (!field.rawValue.trim()) continue; // skip empty extractions

      fieldCreateData.push({
        documentId: ctx.documentId,
        fieldName: field.fieldName,
        fieldType: field.fieldType as never,
        rawValue: field.rawValue,
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
        rawValue: field.rawValue,
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
