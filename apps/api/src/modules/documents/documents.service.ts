import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService, DocumentStatus, ProcessingStage, ProcessingStatus, DocumentCategory } from '@docsaarthi/database';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queue/queue.service';
import { AuditService } from '../audit/audit.service';
import { generateStorageKey, sanitizeFilename } from '@docsaarthi/shared';
import {
  InitiateUploadDto,
  ListDocumentsDto,
  UpdateDocumentDto,
  OverrideCategoryDto,
  CreateVersionDto,
} from './dto/documents.dto';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export type FieldDiffStatus = 'UNCHANGED' | 'CHANGED' | 'ADDED' | 'REMOVED';

export interface FieldDiffItem {
  fieldName: string;
  status: FieldDiffStatus;
  v1Value: string | null;
  v2Value: string | null;
  v1Confidence: number | null;
  v2Confidence: number | null;
}

export interface VersionCompareResult {
  documentId: string;
  documentTitle: string;
  v1: { id: string; versionNumber: number; createdAt: Date };
  v2: { id: string; versionNumber: number; createdAt: Date };
  summary: string;
  fieldDiffs: FieldDiffItem[];
}

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

  // ── Direct Multipart Upload (Cloud Fallback) ────────────────

  async uploadDirect(
    userId: string,
    file: Express.Multer.File,
    dto: { title?: string; tags?: string[] },
    requestId?: string,
  ) {
    const maxFileSize = this.config.get<number>('MAX_FILE_SIZE_BYTES', 52428800);

    if (file.size > maxFileSize) {
      throw new BadRequestException(
        `File too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`,
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'File type not supported. Allowed types: PDF, PNG, JPEG, WebP',
      );
    }

    const document = await this.db.document.create({
      data: {
        userId,
        title: dto.title ?? sanitizeFilename(file.originalname),
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        tags: dto.tags ?? [],
        status: DocumentStatus.QUEUED,
        versions: {
          create: {
            versionNumber: 1,
            uploadedByUserId: userId,
            storageKey: 'PENDING',
            fileSizeBytes: file.size,
          },
        },
      },
      include: { versions: true },
    });

    const version = document.versions[0]!;
    const storageKey = generateStorageKey(userId, document.id, version.id, file.originalname);

    // Save file buffer to storage
    await this.storage.uploadBuffer(storageKey, file.buffer, file.mimetype);

    // Update version
    await this.db.documentVersion.update({
      where: { id: version.id },
      data: {
        storageKey,
        processingStage: ProcessingStage.FILE_VALIDATION,
      },
    });

    await this.db.document.update({
      where: { id: document.id },
      data: { currentVersionId: version.id, status: DocumentStatus.QUEUED },
    });

    // Enqueue processing job safely
    let enqueueSuccess = false;
    try {
      const processingJob = await this.db.processingJob.create({
        data: {
          documentId: document.id,
          versionId: version.id,
          queueName: 'document-processing',
          status: 'QUEUED',
          currentStage: ProcessingStage.FILE_VALIDATION,
        },
      });

      const jobId = await this.queue.enqueueDocumentProcessing({
        documentId: document.id,
        versionId: version.id,
        userId,
        storageKey,
        mimeType: file.mimetype,
        requestId,
      });

      await this.db.processingJob.update({
        where: { id: processingJob.id },
        data: { bullJobId: jobId },
      });

      enqueueSuccess = true;
    } catch (queueErr) {
      this.logger.error(`Could not enqueue to Bull queue immediately: ${String(queueErr)}`);
      await this.db.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.FAILED },
      });
      await this.db.documentVersion.update({
        where: { id: version.id },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          processingError: 'Failed to enqueue processing job. Please use the retry button.',
          processingErrorCode: 'QUEUE_UNAVAILABLE',
        },
      });
    }

    await this.audit.log({
      eventType: 'DOCUMENT_UPLOAD_DIRECT',
      actorId: userId,
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      documentId: document.id,
      requestId,
    });

    this.logger.log(
      `Direct upload completed: document=${document.id} version=${version.id} key=${storageKey} enqueued=${enqueueSuccess}`,
    );

    if (!enqueueSuccess) {
      return {
        documentId: document.id,
        versionId: version.id,
        status: DocumentStatus.FAILED,
        message: 'Document uploaded to storage, but could not be queued for processing. Please retry.',
      };
    }

    return {
      documentId: document.id,
      versionId: version.id,
      status: DocumentStatus.QUEUED,
      message: 'Document uploaded and queued for processing',
    };
  }

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
            storageKey: 'PENDING',
          },
        },
      },
      include: { versions: true },
    });

    const version = document.versions[0]!;
    const storageKey = generateStorageKey(userId, document.id, version.id, dto.fileName);

    // Update version with real storage key
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

    const meta = await this.storage.objectExists(version.storageKey);
    if (!meta) {
      throw new BadRequestException(
        'File not found in storage. Please upload the file before confirming.',
      );
    }

    const detectedMime = await this.detectMimeFromStorage(version.storageKey);
    if (detectedMime && detectedMime !== document.mimeType) {
      this.logger.warn(
        `MIME mismatch for document ${documentId}: declared=${document.mimeType}, detected=${detectedMime}`,
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

    await this.db.documentVersion.update({
      where: { id: versionId },
      data: {
        fileSizeBytes: actualSize,
        checksum: etag,
        processingStage: ProcessingStage.FILE_VALIDATION,
      },
    });

    await this.db.document.update({
      where: { id: documentId },
      data: { currentVersionId: versionId, status: DocumentStatus.QUEUED },
    });

    let enqueueSuccess = false;
    try {
      const processingJob = await this.db.processingJob.create({
        data: {
          documentId,
          versionId,
          queueName: 'document-processing',
          status: 'QUEUED',
          currentStage: ProcessingStage.FILE_VALIDATION,
        },
      });

      const jobId = await this.queue.enqueueDocumentProcessing({
        documentId,
        versionId,
        userId,
        storageKey: version.storageKey,
        mimeType: document.mimeType,
        requestId,
      });

      await this.db.processingJob.update({
        where: { id: processingJob.id },
        data: { bullJobId: jobId },
      });

      enqueueSuccess = true;
    } catch (queueErr) {
      this.logger.error(`Could not enqueue confirmed upload to Bull queue: ${String(queueErr)}`);
      await this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED },
      });
      await this.db.documentVersion.update({
        where: { id: versionId },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          processingError: 'Failed to enqueue processing job. Please use the retry button.',
          processingErrorCode: 'QUEUE_UNAVAILABLE',
        },
      });
    }

    await this.audit.log({
      eventType: 'DOCUMENT_UPLOAD_CONFIRMED',
      actorId: userId,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      documentId,
      requestId,
    });

    if (!enqueueSuccess) {
      return {
        documentId,
        versionId,
        status: DocumentStatus.FAILED,
        message: 'Upload confirmed, but could not be queued for processing. Please retry.',
      };
    }

    return {
      documentId,
      versionId,
      status: DocumentStatus.QUEUED,
      message: 'Document is queued for processing',
    };
  }

  // ── Retry Processing ──────────────────────────────────────────

  async retryProcessing(userId: string, documentId: string, requestId?: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const version = document.versions[0];
    if (!version || !version.storageKey) {
      throw new BadRequestException('No valid document version found to retry');
    }

    // Reset status to QUEUED
    await this.db.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.QUEUED },
    });

    await this.db.documentVersion.update({
      where: { id: version.id },
      data: {
        processingStatus: ProcessingStatus.QUEUED,
        processingError: null,
        processingErrorCode: null,
        startedAt: null,
        completedAt: null,
      },
    });

    const processingJob = await this.db.processingJob.create({
      data: {
        documentId,
        versionId: version.id,
        queueName: 'document-processing',
        status: 'QUEUED',
        currentStage: ProcessingStage.FILE_VALIDATION,
      },
    });

    try {
      const jobId = await this.queue.enqueueDocumentProcessing({
        documentId,
        versionId: version.id,
        userId,
        storageKey: version.storageKey,
        mimeType: document.mimeType,
        requestId,
      });

      await this.db.processingJob.update({
        where: { id: processingJob.id },
        data: { bullJobId: jobId },
      });

      await this.audit.log({
        eventType: 'DOCUMENT_PROCESSING_RETRY',
        actorId: userId,
        resourceType: 'DOCUMENT',
        resourceId: documentId,
        documentId,
        requestId,
      });

      return {
        documentId,
        versionId: version.id,
        status: DocumentStatus.QUEUED,
        message: 'Document processing retry enqueued successfully',
      };
    } catch (err) {
      this.logger.error(`Retry enqueue failed: ${String(err)}`);
      await this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED },
      });
      await this.db.documentVersion.update({
        where: { id: version.id },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          processingError: 'Failed to enqueue retry processing job to worker queue',
          processingErrorCode: 'QUEUE_UNAVAILABLE',
        },
      });

      throw new BadRequestException(
        'Could not enqueue processing job to queue. Please check Redis connection.',
      );
    }
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
          categoryOverride: true,
          primaryLanguage: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          versions: {
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

  // ── Get Document Detail ──────────────────────────────────────

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
            thumbnailStorageKey: true,
            processingStatus: true,
            processingStage: true,
            notes: true,
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

  // ── Get Pages ────────────────────────────────────────────────

  async getPages(userId: string, documentId: string, versionId?: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    const targetVersion = versionId
      ? await this.db.documentVersion.findFirst({ where: { id: versionId, documentId } })
      : await this.db.documentVersion.findFirst({
          where: { documentId },
          orderBy: { versionNumber: 'desc' },
        });

    if (!targetVersion) return { documentId, pages: [] };

    const pages = await this.db.documentPage.findMany({
      where: { versionId: targetVersion.id },
      orderBy: { pageNumber: 'asc' },
      select: {
        id: true,
        pageNumber: true,
        storageKey: true,
        width: true,
        height: true,
        language: true,
        confidence: true,
      },
    });

    // Generate presigned URLs for page images
    const pagesWithUrls = await Promise.all(
      pages.map(async (p: (typeof pages)[number]) => {
        let imageUrl: string | null = null;
        try {
          imageUrl = await this.storage.createPresignedDownloadUrl(p.storageKey, 3600);
        } catch {
          // ignore
        }
        return { ...p, imageUrl };
      }),
    );

    return { documentId, versionId: targetVersion.id, pages: pagesWithUrls };
  }

  // ── Get Page Detail ──────────────────────────────────────────

  async getPage(userId: string, documentId: string, pageNum: number, versionId?: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    const targetVersion = versionId
      ? await this.db.documentVersion.findFirst({ where: { id: versionId, documentId } })
      : await this.db.documentVersion.findFirst({
          where: { documentId },
          orderBy: { versionNumber: 'desc' },
        });

    if (!targetVersion) throw new NotFoundException('No version found');

    const page = await this.db.documentPage.findUnique({
      where: { versionId_pageNumber: { versionId: targetVersion.id, pageNumber: pageNum } },
    });
    if (!page) throw new NotFoundException(`Page ${pageNum} not found`);

    let imageUrl: string | null = null;
    try {
      imageUrl = await this.storage.createPresignedDownloadUrl(page.storageKey, 3600);
    } catch {
      // ignore
    }

    const ocrResult = await this.db.ocrResult.findFirst({
      where: { versionId: targetVersion.id, pageNumber: pageNum },
      select: {
        id: true,
        pageNumber: true,
        rawText: true,
        blocks: true,
        pageConfidence: true,
        pageLanguage: true,
        ocrProvider: true,
        fallbackUsed: true,
        processingTimeMs: true,
      },
    });

    return { documentId, page: { ...page, imageUrl }, ocrResult };
  }

  // ── Get Extracted Fields ─────────────────────────────────────

  async getFields(userId: string, documentId: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      select: {
        id: true,
        category: true,
        categoryConfidence: true,
        categoryOverride: true,
      },
    });
    if (!document) throw new NotFoundException('Document not found');

    const fields = await this.db.documentField.findMany({
      where: { documentId, isRejected: false },
      orderBy: { confidence: 'desc' },
      select: {
        id: true,
        fieldName: true,
        fieldType: true,
        rawValue: true,
        normalizedValue: true,
        confidence: true,
        confidenceLevel: true,
        sourcePage: true,
        sourceBbox: true,
        isVerified: true,
        isRejected: true,
        extractionMethod: true,
        createdAt: true,
      },
    });

    const overallConfidence =
      fields.length > 0 ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length : null;

    return {
      documentId,
      category: document.category,
      categoryConfidence: document.categoryConfidence,
      categoryOverride: document.categoryOverride,
      overallConfidence,
      fields,
    };
  }

  // ── Get Raw OCR ──────────────────────────────────────────────

  async getOcr(userId: string, documentId: string, versionId?: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    const targetVersion = versionId
      ? await this.db.documentVersion.findFirst({ where: { id: versionId, documentId } })
      : await this.db.documentVersion.findFirst({
          where: { documentId },
          orderBy: { versionNumber: 'desc' },
        });

    if (!targetVersion) return { documentId, pages: [] };

    const ocrResults = await this.db.ocrResult.findMany({
      where: { versionId: targetVersion.id },
      orderBy: { pageNumber: 'asc' },
      select: {
        id: true,
        pageNumber: true,
        rawText: true,
        blocks: true,
        pageConfidence: true,
        pageLanguage: true,
        ocrProvider: true,
        fallbackUsed: true,
        fallbackProvider: true,
        processingTimeMs: true,
      },
    });

    return { documentId, pages: ocrResults };
  }

  // ── Override Document Category (Checkpoint 3) ────────────────

  async overrideCategory(
    userId: string,
    documentId: string,
    dto: OverrideCategoryDto,
    requestId?: string,
  ) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
    });

    if (!document) throw new NotFoundException('Document not found');

    const previousCategory = document.category ?? DocumentCategory.UNKNOWN;
    const previousConfidence = document.categoryConfidence ?? 0.0;

    const updated = await this.db.document.update({
      where: { id: documentId },
      data: {
        category: dto.category,
        categoryOverride: true,
      },
      select: {
        id: true,
        category: true,
        categoryOverride: true,
        categoryConfidence: true,
        updatedAt: true,
      },
    });

    await this.db.classificationCorrection.upsert({
      where: { documentId },
      create: {
        documentId,
        aiCategory: previousCategory,
        aiConfidence: previousConfidence,
        userCategory: dto.category,
        reason: dto.reason,
        correctedByUserId: userId,
      },
      update: {
        userCategory: dto.category,
        reason: dto.reason,
      },
    });

    await this.audit.log({
      eventType: 'CLASSIFICATION_OVERRIDDEN',
      actorId: userId,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      documentId,
      changes: {
        previousCategory,
        newCategory: dto.category,
        reason: dto.reason,
      },
      requestId,
    });

    this.logger.log(
      `Document ${documentId} category overridden by ${userId} to ${dto.category}`,
    );

    return updated;
  }

  // ── Document Versioning (Checkpoint 3) ───────────────────────

  async getVersions(userId: string, documentId: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      select: { id: true },
    });

    if (!document) throw new NotFoundException('Document not found');

    const versions = await this.db.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'asc' },
      select: {
        id: true,
        versionNumber: true,
        pageCount: true,
        fileSizeBytes: true,
        thumbnailStorageKey: true,
        processingStatus: true,
        processingStage: true,
        notes: true,
        startedAt: true,
        completedAt: true,
        processingDurationMs: true,
        createdAt: true,
      },
    });

    return { documentId, versions };
  }

  async createVersion(
    userId: string,
    documentId: string,
    dto: CreateVersionDto,
    requestId?: string,
  ) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });

    if (!document) throw new NotFoundException('Document not found');

    const nextVersionNumber = (document.versions[0]?.versionNumber ?? 0) + 1;
    const presignExpiry = this.config.get<number>('MINIO_PRESIGN_EXPIRY_SECONDS', 3600);

    const version = await this.db.documentVersion.create({
      data: {
        documentId,
        versionNumber: nextVersionNumber,
        uploadedByUserId: userId,
        storageKey: 'PENDING',
        notes: dto.notes,
        fileSizeBytes: dto.fileSize,
      },
    });

    const storageKey = generateStorageKey(userId, documentId, version.id, dto.fileName);

    await this.db.documentVersion.update({
      where: { id: version.id },
      data: { storageKey },
    });

    const presignedUpload = await this.storage.createPresignedUpload(
      storageKey,
      dto.mimeType,
      dto.fileSize,
      presignExpiry,
    );

    await this.audit.log({
      eventType: 'DOCUMENT_VERSION_INITIATED',
      actorId: userId,
      resourceType: 'DOCUMENT_VERSION',
      resourceId: version.id,
      documentId,
      changes: { versionNumber: nextVersionNumber },
      requestId,
    });

    return {
      documentId,
      versionId: version.id,
      versionNumber: nextVersionNumber,
      uploadUrl: presignedUpload.url,
      uploadFields: presignedUpload.fields,
      storageKey,
      expiresAt: presignedUpload.expiresAt,
    };
  }

  async getVersionDetail(userId: string, documentId: string, versionId: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      select: { id: true, title: true },
    });

    if (!document) throw new NotFoundException('Document not found');

    const version = await this.db.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: {
        pages: { orderBy: { pageNumber: 'asc' } },
        versionFields: true,
        ocrResults: true,
      },
    });

    if (!version) throw new NotFoundException('Version not found');

    return { document, version };
  }

  async compareVersions(userId: string, documentId: string, v1Id: string, v2Id: string) {
    const document = await this.db.document.findFirst({
      where: { id: documentId, userId, isDeleted: false },
      select: { id: true, title: true, category: true },
    });

    if (!document) throw new NotFoundException('Document not found');

    const [v1, v2] = await Promise.all([
      this.db.documentVersion.findFirst({
        where: { id: v1Id, documentId },
        include: {
          versionFields: true,
          ocrResults: { orderBy: { pageNumber: 'asc' } },
        },
      }),
      this.db.documentVersion.findFirst({
        where: { id: v2Id, documentId },
        include: {
          versionFields: true,
          ocrResults: { orderBy: { pageNumber: 'asc' } },
        },
      }),
    ]);

    if (!v1 || !v2) {
      throw new NotFoundException('One or both versions not found for comparison');
    }

    // ── Field-by-Field Diff ──────────────────────────────────────────
    const v1FieldsMap = new Map(v1.versionFields.map((f: (typeof v1.versionFields)[number]) => [f.fieldName, f]));
    const v2FieldsMap = new Map(v2.versionFields.map((f: (typeof v2.versionFields)[number]) => [f.fieldName, f]));
    const allFieldNames = new Set([...v1FieldsMap.keys(), ...v2FieldsMap.keys()]);

    const fieldDiffs: FieldDiffItem[] = [];

    for (const fieldName of allFieldNames) {
      const f1 = v1FieldsMap.get(fieldName);
      const f2 = v2FieldsMap.get(fieldName);

      if (f1 && f2) {
        if (f1.rawValue.trim() === f2.rawValue.trim()) {
          fieldDiffs.push({
            fieldName,
            status: 'UNCHANGED',
            v1Value: f1.rawValue,
            v2Value: f2.rawValue,
            v1Confidence: f1.confidence,
            v2Confidence: f2.confidence,
          });
        } else {
          fieldDiffs.push({
            fieldName,
            status: 'CHANGED',
            v1Value: f1.rawValue,
            v2Value: f2.rawValue,
            v1Confidence: f1.confidence,
            v2Confidence: f2.confidence,
          });
        }
      } else if (!f1 && f2) {
        fieldDiffs.push({
          fieldName,
          status: 'ADDED',
          v1Value: null,
          v2Value: f2.rawValue,
          v1Confidence: null,
          v2Confidence: f2.confidence,
        });
      } else if (f1 && !f2) {
        fieldDiffs.push({
          fieldName,
          status: 'REMOVED',
          v1Value: f1.rawValue,
          v2Value: null,
          v1Confidence: f1.confidence,
          v2Confidence: null,
        });
      }
    }

    // Sort: CHANGED first, then ADDED, REMOVED, UNCHANGED
    const orderScore: Record<FieldDiffStatus, number> = {
      CHANGED: 1,
      ADDED: 2,
      REMOVED: 3,
      UNCHANGED: 4,
    };
    fieldDiffs.sort((a, b) => orderScore[a.status] - orderScore[b.status]);

    const changedCount = fieldDiffs.filter((d) => d.status === 'CHANGED').length;
    const addedCount = fieldDiffs.filter((d) => d.status === 'ADDED').length;
    const removedCount = fieldDiffs.filter((d) => d.status === 'REMOVED').length;

    const summary = `${changedCount} field(s) modified, ${addedCount} field(s) added, ${removedCount} field(s) removed between Version ${v1.versionNumber} and Version ${v2.versionNumber}.`;

    return {
      documentId,
      documentTitle: document.title,
      v1: {
        id: v1.id,
        versionNumber: v1.versionNumber,
        createdAt: v1.createdAt,
      },
      v2: {
        id: v2.id,
        versionNumber: v2.versionNumber,
        createdAt: v2.createdAt,
      },
      summary,
      fieldDiffs,
    };
  }

  // ── Update Document ──────────────────────────────────────────────

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

      if (buffer.subarray(0, 4).toString() === '%PDF') {
        return 'application/pdf';
      }
      if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        return 'image/png';
      }
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
      }
      if (
        buffer.subarray(0, 4).toString() === 'RIFF' &&
        buffer.length >= 12 &&
        buffer.subarray(8, 12).toString() === 'WEBP'
      ) {
        return 'image/webp';
      }

      return null;
    } catch {
      return null;
    }
  }
}
