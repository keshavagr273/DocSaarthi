import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUES, JOBS } from '@docsaarthi/shared';

export interface DocumentProcessingJobData {
  documentId: string;
  versionId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
  requestId?: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUES.DOCUMENT_PROCESSING)
    private readonly documentQueue: Queue<DocumentProcessingJobData>,
  ) {}

  async enqueueDocumentProcessing(
    data: DocumentProcessingJobData,
    maxRetries = 2,
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const enqueuePromise = this.documentQueue.add(JOBS.PROCESS_DOCUMENT, data, {
          jobId: `doc-${data.documentId}-v${data.versionId}-${Date.now()}`,
          removeOnComplete: 100,
          removeOnFail: 100,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis queue enqueue timed out after 15s')), 15000),
        );

        const job = await Promise.race([enqueuePromise, timeoutPromise]);

        this.logger.log(
          `Enqueued job ${job.id} for document ${data.documentId} (version ${data.versionId}) [attempt ${attempt}]`,
        );

        return String(job.id);
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `Enqueue attempt ${attempt}/${maxRetries} failed for document ${data.documentId}: ${String(err)}`,
        );
        if (attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
    }

    this.logger.error(
      `Could not enqueue to Redis queue after ${maxRetries} attempts: ${String(lastError)}`,
    );
    throw new Error(
      `Failed to enqueue document processing job to Redis queue: ${String(lastError)}`,
    );
  }

  async getQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.documentQueue.getWaitingCount(),
        this.documentQueue.getActiveCount(),
        this.documentQueue.getCompletedCount(),
        this.documentQueue.getFailedCount(),
        this.documentQueue.getDelayedCount(),
      ]);

      return { waiting, active, completed, failed, delayed };
    } catch (err) {
      this.logger.warn(`Failed to fetch queue stats: ${String(err)}`);
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
  }
}
