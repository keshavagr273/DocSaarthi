import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseService, ProcessingStage } from '@docsaarthi/database';
import { BaseStage } from './base.stage';
import { LlmService } from '../services/llm.service';
import type { PipelineContext, ExtractedField } from './pipeline-context';
import type { DocumentProcessingJobData } from '../processors/document.processor';

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
    await this.markStageProcessing(ctx.versionId);
    await this.reportProgress(job, 60);

    const text = ctx.normalizedText ?? '';
    const category = ctx.category ?? 'UNKNOWN';
    const language = ctx.primaryLanguage ?? 'en';

    const { fields } = await this.llm.extractFields(text, category, language);

    // Delete any existing fields for this document (idempotency on retry)
    await this.db.documentField.deleteMany({ where: { documentId: ctx.documentId } });
    await this.db.documentVersionField.deleteMany({ where: { versionId: ctx.versionId } });

    const createdFields: ExtractedField[] = [];

    for (const field of fields) {
      if (!field.rawValue.trim()) continue; // skip empty extractions

      // Create document_fields record
      await this.db.documentField.create({
        data: {
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
        },
      });

      // Create document_version_fields record
      await this.db.documentVersionField.create({
        data: {
          versionId: ctx.versionId,
          fieldName: field.fieldName,
          fieldType: field.fieldType as never,
          rawValue: field.rawValue,
          confidence: field.confidence,
          sourcePage: field.sourcePage ?? null,
          extractionMethod: 'llm',
        },
      });

      createdFields.push(field);
    }

    ctx.extractedFields = createdFields;

    await this.markStageCompleted(ctx.versionId);
    this.logger.log(
      `[${ctx.documentId}] Stage 9 DONE — extracted ${createdFields.length} fields`,
    );
  }

  private toConfidenceLevel(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (confidence >= 0.85) return 'HIGH';
    if (confidence >= 0.65) return 'MEDIUM';
    return 'LOW';
  }
}
