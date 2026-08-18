import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService, DocumentStatus, ProcessingStage } from '@docsaarthi/database';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queue/queue.service';
import { AuditService } from '../audit/audit.service';
import { generateStorageKey, sanitizeFilename } from '@docsaarthi/shared';
import { InitiateUploadDto, ListDocumentsDto, UpdateDocumentDto } from './dto/documents.dto';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ── Initiate Upload ──────────────────────────────────────────

  async initiateUpload(userId: string, dto: InitiateUploadDto, requestId?: string) {
    const maxFileSize = this.config.get<number>('MAX_FILE_SIZE_BYTES', 52428800);
    const presignExpiry = this.config.get<number>('MINIO_PRESIGN_EXPIRY_SECONDS', 3600);

    if (dto.fileSize > maxFileSize) {
      throw new BadRequestException(
        `File too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`,
      );
    }

    if (!ALLOWED_MIME_TYPES.has(dto.mimeType)) {
      throw new BadRequestException(
        'File type not supported. Allowed types: PDF, PNG, JPEG, WebP',
      );
    }

    // Create document and initial version atomically
    const document = await this.db.document.create({
      data: {
        userId,
        title: dto.title ?? sanitizeFilename(dto.fileName),
        originalFileName: dto.fileName,
        mimeType: dto.mimeType,
        fileSizeBytes: dto.fileSize,
        tags: dto.tags ?? [],
        status: DocumentStatus.QUEUED,
        versions: {
          create: {
            versionNumber: 1,
            uploadedByUserId: userId,
            storageKey: 'PENDING', // Will be set below
          },
        },
      },
      include: { versions: true },
    });

    const version = document.versions[0]!;
    const storageKey = generateStorageKey(userId, document.id, version.id, dto.fileName);

    // Update version with the real storage key
    await this.db.documentVersion.update({
      where: { id: version.id },
      data: { storageKey },
    });

    // Get presigned upload URL from MinIO
    const presignedUpload = await this.storage.createPresignedUpload(
      storageKey,
      dto.mimeType,
      dto.fileSize,
      presignExpiry,
    );

    await this.audit.log({
      eventType: 'DOCUMENT_UPLOAD_INITIATED',
      actorId: userId,
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      documentId: document.id,
      requestId,
    });

    this.logger.log(
      `Upload initiated: document=${document.id} version=${version.id} key=${storageKey}`,
    );

    return {
      documentId: document.id,
      versionId: version.id,
      uploadUrl: presignedUpload.url,
      uploadFields: presignedUpload.fields,
      storageKey,
      expiresAt: presignedUpload.expiresAt,
    };
  }

  // ── Confirm Upload ───────────────────────────────────────────

  async confirmUpload(
    userId: string,
    documentId: string,
    versionId: string,
    requestId?: string,
  ) {
    // Verify ownership
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      include: {
        versions: { where: { id: versionId } },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const version = document.versions[0];
    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    // Verify file actually exists in MinIO
    const meta = await this.storage.objectExists(version.storageKey);
    if (!meta) {
      throw new BadRequestException(
        'File not found in storage. Please upload the file before confirming.',
      );
    }

    // ── Server-side MIME type validation (magic bytes) ────────
    // We download a small chunk to detect file type
    const detectedMime = await this.detectMimeFromStorage(version.storageKey);
    if (detectedMime && detectedMime !== document.mimeType) {
      // MIME mismatch — delete file and reject
      this.logger.warn(
        `MIME mismatch for document ${documentId}: ` +
          `declared=${document.mimeType}, detected=${detectedMime}`,
      );
      await this.storage.deleteObject(version.storageKey);
      await this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED },
      });
      throw new BadRequestException(
        'File type does not match the declared MIME type. Upload rejected for security.',
      );
    }

    const actualSize = meta.ContentLength ?? document.fileSizeBytes;
    const etag = meta.ETag?.replace(/"/g, '') ?? '';

    // Update version with confirmed metadata
    await this.db.documentVersion.update({
      where: { id: versionId },
      data: {
        fileSizeBytes: actualSize,
        checksum: etag,
        processingStage: ProcessingStage.FILE_VALIDATION,
      },
    });

    // Update document currentVersionId
    await this.db.document.update({
      where: { id: documentId },
      data: { currentVersionId: versionId },
    });

    // Create processing job record
    const processingJob = await this.db.processingJob.create({
      data: {
        documentId,
        versionId,
        queueName: 'document-processing',
        status: 'QUEUED',
        currentStage: ProcessingStage.FILE_VALIDATION,
      },
    });

    // Enqueue BullMQ job
    const jobId = await this.queue.enqueueDocumentProcessing({
      documentId,
      versionId,
      userId,
      storageKey: version.storageKey,
      mimeType: document.mimeType,
      requestId,
    });

    // Link job ID
    await this.db.processingJob.update({
      where: { id: processingJob.id },
      data: { bullJobId: jobId },
    });

    await this.audit.log({
      eventType: 'DOCUMENT_UPLOAD_CONFIRMED',
      actorId: userId,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      documentId,
      requestId,
    });

    this.logger.log(
      `Upload confirmed and processing enqueued: document=${documentId} job=${jobId}`,
    );

    return {
      documentId,
      versionId,
      status: 'QUEUED',
      message: 'Document is queued for processing',
    };
  }

  // ── List Documents ───────────────────────────────────────────

  async findAll(userId: string, dto: ListDocumentsDto) {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = {
      userId,
      isDeleted: false,
      ...(dto.category ? { category: dto.category as never } : {}),
      ...(dto.status ? { status: dto.status as never } : {}),
      ...(dto.search
        ? {
            OR: [
              { title: { contains: dto.search, mode: 'insensitive' as const } },
              { originalFileName: { contains: dto.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, documents] = await Promise.all([
      this.db.document.count({ where }),
      this.db.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [dto.sortBy ?? 'createdAt']: dto.sortOrder ?? 'desc' },
        select: {
          id: true,
          title: true,
          originalFileName: true,
          mimeType: true,
          fileSizeBytes: true,
          status: true,
          category: true,
          categoryConfidence: true,
          primaryLanguage: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          versions: {
            where: { id: { not: undefined } },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              pageCount: true,
              processingStatus: true,
              processingStage: true,
            },
          },
        },
      }),
    ]);

    return {
      documents: documents.map((d: (typeof documents)[number]) => ({
        ...d,
        currentVersion: d.versions[0] ?? null,
        versions: undefined,
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Get Document ─────────────────────────────────────────────

  async findOne(userId: string, documentId: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            pageCount: true,
            processingStatus: true,
            processingStage: true,
            startedAt: true,
            completedAt: true,
            processingDurationMs: true,
          },
        },
        fields: {
          where: { isRejected: false },
          orderBy: { confidence: 'desc' },
        },
      },
    });

    if (!document) throw new NotFoundException('Document not found');

    return document;
  }

  // ── Get Processing Status ────────────────────────────────────

  async getStatus(userId: string, documentId: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      select: {
        id: true,
        status: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            processingStatus: true,
            processingStage: true,
            processingError: true,
            processingErrorCode: true,
            stageHistory: true,
            startedAt: true,
            completedAt: true,
            retryCount: true,
          },
        },
      },
    });

    if (!document) throw new NotFoundException('Document not found');

    const version = document.versions[0];
    if (!version) {
      return { documentId, status: document.status };
    }

    const completedStages = this.getCompletedStages(version.processingStage ?? null);
    const totalStages = 15;
    const progress = Math.round((completedStages.length / totalStages) * 100);

    return {
      documentId,
      status: document.status,
      currentStage: version.processingStage,
      processingStatus: version.processingStatus,
      completedStages,
      progress,
      stageHistory: version.stageHistory,
      startedAt: version.startedAt,
      completedAt: version.completedAt,
      error: version.processingError
        ? { message: version.processingError, code: version.processingErrorCode }
        : null,
      retryCount: version.retryCount,
    };
  }

  // ── Update Document ──────────────────────────────────────────

  async update(userId: string, documentId: string, dto: UpdateDocumentDto) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
    });

    if (!document) throw new NotFoundException('Document not found');

    return this.db.document.update({
      where: { id: documentId },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.tags ? { tags: dto.tags } : {}),
      },
      select: { id: true, title: true, tags: true, updatedAt: true },
    });
  }

  // ── Delete Document ──────────────────────────────────────────

  async remove(userId: string, documentId: string, requestId?: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
    });

    if (!document) throw new NotFoundException('Document not found');

    // Soft delete
    await this.db.document.update({
      where: { id: documentId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    await this.audit.log({
      eventType: 'DOCUMENT_DELETED',
      actorId: userId,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      documentId,
      requestId,
    });

    return { message: 'Document deleted successfully' };
  }

  // ── Helpers ─────────────────────────────────────────────────

  private getCompletedStages(currentStage: ProcessingStage | null): ProcessingStage[] {
    const stageOrder: ProcessingStage[] = [
      ProcessingStage.FILE_VALIDATION,
      ProcessingStage.FILE_STORAGE,
      ProcessingStage.PDF_RENDERING,
      ProcessingStage.IMAGE_PREPROCESSING,
      ProcessingStage.OCR,
      ProcessingStage.LANGUAGE_DETECTION,
      ProcessingStage.DOCUMENT_CLASSIFICATION,
      ProcessingStage.TEXT_NORMALIZATION,
      ProcessingStage.STRUCTURED_EXTRACTION,
      ProcessingStage.CONFIDENCE_SCORING,
      ProcessingStage.VALIDATION,
      ProcessingStage.CHUNKING,
      ProcessingStage.EMBEDDING,
      ProcessingStage.INDEXING,
      ProcessingStage.COMPLETED,
    ];

    if (!currentStage) return [];
    const currentIdx = stageOrder.indexOf(currentStage);
    return stageOrder.slice(0, currentIdx);
  }

  private async detectMimeFromStorage(storageKey: string): Promise<string | null> {
    try {
      const url = await this.storage.createPresignedDownloadUrl(storageKey, 60);
      const response = await fetch(url, {
        headers: { Range: 'bytes=0-32' },
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 4) return null;

      // PDF: %PDF
      if (buffer.subarray(0, 4).toString() === '%PDF') {
        return 'application/pdf';
      }
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        return 'image/png';
      }
      // JPEG: FF D8 FF
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
      }
      // WebP: RIFF....WEBP
      if (
        buffer.subarray(0, 4).toString() === 'RIFF' &&
        buffer.length >= 12 &&
        buffer.subarray(8, 12).toString() === 'WEBP'
      ) {
        return 'image/webp';
      }

      return null;
    } catch {
      // If detection fails, don't block the upload
      return null;
    }
  }
}
