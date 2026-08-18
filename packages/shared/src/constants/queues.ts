// Queue names
export const QUEUES = {
  DOCUMENT_PROCESSING: 'document-processing',
  OCR_PROCESSING: 'ocr-processing',
  LLM_PROCESSING: 'llm-processing',
  EMBEDDING_PROCESSING: 'embedding-processing',
  NOTIFICATION: 'notification-processing',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// Job names
export const JOBS = {
  PROCESS_DOCUMENT: 'process-document',
  PROCESS_OCR: 'process-ocr',
  EXTRACT_FIELDS: 'extract-fields',
  EMBED_DOCUMENT: 'embed-document',
  SEND_NOTIFICATION: 'send-notification',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
