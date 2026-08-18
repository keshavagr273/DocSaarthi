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

  async enqueueDocumentProcessing(data: DocumentProcessingJobData): Promise<string> {
    const job = await this.documentQueue.add(JOBS.PROCESS_DOCUMENT, data, {
      jobId: `doc-${data.documentId}-v${data.versionId}`,
    });

    this.logger.log(
      `Enqueued job ${job.id} for document ${data.documentId} (version ${data.versionId})`,
    );

    return String(job.id);
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.documentQueue.getWaitingCount(),
      this.documentQueue.getActiveCount(),
      this.documentQueue.getCompletedCount(),
      this.documentQueue.getFailedCount(),
      this.documentQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}
