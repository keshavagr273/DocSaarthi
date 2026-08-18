import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { DatabaseModule } from '@docsaarthi/database';
import { QUEUES } from '@docsaarthi/shared';
import { DocumentProcessor } from './processors/document.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    DatabaseModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        prefix: process.env['REDIS_PREFIX'] ?? 'docsaarthi:',
      }),
    }),
    BullModule.registerQueue({ name: QUEUES.DOCUMENT_PROCESSING }),
  ],
  providers: [DocumentProcessor],
})
export class WorkerAppModule {}
