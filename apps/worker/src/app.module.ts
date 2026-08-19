import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '@docsaarthi/database';
import { QUEUES } from '@docsaarthi/shared';

// Processor
import { DocumentProcessor } from './processors/document.processor';

// Services
import { StorageClientService } from './services/storage-client.service';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    HttpModule,
    DatabaseModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        prefix: process.env['REDIS_PREFIX'] ?? 'docsaarthi:',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          timeout: 600_000, // 10 minutes per job
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 200 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUES.DOCUMENT_PROCESSING }),
  ],
  providers: [
    // Services
    StorageClientService,
    LlmService,
    OcrClientService,

    // Stages
    ...ALL_STAGES,

    // Processor
    DocumentProcessor,
  ],
})
export class WorkerAppModule {}
