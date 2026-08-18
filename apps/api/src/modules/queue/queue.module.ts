import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUES } from '@docsaarthi/shared';
import { QueueService } from './queue.service';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.DOCUMENT_PROCESSING,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        timeout: 600000, // 10 minutes
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    }),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
