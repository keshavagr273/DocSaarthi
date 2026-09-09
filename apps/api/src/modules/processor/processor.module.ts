import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUES } from '@docsaarthi/shared';

// Processor
import { DocumentProcessor } from './document.processor';

// Services
import { LlmService } from './services/llm.service';
import { OcrClientService } from './services/ocr-client.service';

// Stages
import { FileValidationStage } from './stages/file-validation.stage';
import { FileStorageStage } from './stages/file-storage.stage';
import { PdfRenderingStage } from './stages/pdf-rendering.stage';
import { ImagePreprocessingStage } from './stages/image-preprocessing.stage';
import { OcrStage } from './stages/ocr.stage';
import { LanguageDetectionStage } from './stages/language-detection.stage';
import { ClassificationStage } from './stages/classification.stage';
import { TextNormalizationStage } from './stages/text-normalization.stage';
import { StructuredExtractionStage } from './stages/structured-extraction.stage';
import { ConfidenceScoringStage } from './stages/confidence-scoring.stage';
import { ValidationStage } from './stages/validation.stage';
import { ChunkingStage } from './stages/chunking.stage';
import { EmbeddingStage } from './stages/embedding.stage';
import { IndexingStage } from './stages/indexing.stage';

const ALL_STAGES = [
  FileValidationStage,
  FileStorageStage,
  PdfRenderingStage,
  ImagePreprocessingStage,
  OcrStage,
  LanguageDetectionStage,
  ClassificationStage,
  TextNormalizationStage,
  StructuredExtractionStage,
  ConfidenceScoringStage,
  ValidationStage,
  ChunkingStage,
  EmbeddingStage,
  IndexingStage,
];

/**
 * ProcessorModule — runs the document processing pipeline inside the API process.
 *
 * Merged from apps/worker so we don't need a separate background worker service.
 * Uses the same Redis queue (DOCUMENT_PROCESSING) that the API enqueues jobs onto.
 * StorageService is provided globally via StorageModule (@Global).
 * DatabaseService is provided globally via DatabaseModule (@Global).
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.DOCUMENT_PROCESSING,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        timeout: 600_000, // 10 minutes per job
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    }),
  ],
  providers: [
    // Services (LLM + OCR client)
    LlmService,
    OcrClientService,

    // Pipeline stages
    ...ALL_STAGES,

    // Main BullMQ processor
    DocumentProcessor,
  ],
})
export class ProcessorModule {}
