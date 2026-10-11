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
 * This is the only consumer of the DOCUMENT_PROCESSING queue. A separate
 * apps/worker service used to run a second, independently-maintained copy of
 * these same stages against the same queue and Redis prefix, so each document
 * was processed by whichever process happened to pick it up — and the two
 * copies had drifted apart. That app has been removed; this is the single
 * pipeline.
 *
 * StorageService is provided globally via StorageModule (@Global).
 * DatabaseService is provided globally via DatabaseModule (@Global).
 */
@Module({
  imports: [
    // Register by name only. QueueModule owns this queue's defaultJobOptions —
    // declaring them in both places meant two registrations competing for the
    // same injection token, so which set of retry/timeout options actually
    // applied depended on module resolution order.
    BullModule.registerQueue({ name: QUEUES.DOCUMENT_PROCESSING }),
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
