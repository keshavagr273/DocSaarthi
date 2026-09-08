import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService, DocumentStatus, ProcessingStatus } from '@docsaarthi/database';
import { QueueService } from '../queue/queue.service';
import { AuditService } from '../audit/audit.service';

export interface AdminUserListItem {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  totalDocuments: number;
  completedDocuments: number;
  queuedDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  successRate: number;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queueService: QueueService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * System-wide overview statistics
   */
  async getOverviewStats() {
    const [
      totalUsers,
      totalDocuments,
      completedDocs,
      queuedDocs,
      processingDocs,
      failedDocs,
      storageAggregate,
      queueStats,
    ] = await Promise.all([
      this.db.user.count(),
      this.db.document.count({ where: { isDeleted: false } }),
      this.db.document.count({ where: { isDeleted: false, status: DocumentStatus.COMPLETED } }),
      this.db.document.count({ where: { isDeleted: false, status: DocumentStatus.QUEUED } }),
      this.db.document.count({ where: { isDeleted: false, status: DocumentStatus.PROCESSING } }),
      this.db.document.count({ where: { isDeleted: false, status: DocumentStatus.FAILED } }),
      this.db.document.aggregate({
        where: { isDeleted: false },
        _sum: { fileSizeBytes: true },
      }),
      this.queueService.getQueueStats(),
    ]);

    const successRate = totalDocuments > 0
      ? Math.round((completedDocs / totalDocuments) * 100)
      : 100;

    return {
      users: {
        total: totalUsers,
      },
      documents: {
        total: totalDocuments,
        completed: completedDocs,
        queued: queuedDocs,
        processing: processingDocs,
        failed: failedDocs,
        successRate,
        totalBytes: storageAggregate._sum.fileSizeBytes ?? 0,
      },
      queue: {
        ...queueStats,
        backlog: (queueStats.waiting ?? 0) + (queueStats.active ?? 0) + (queueStats.delayed ?? 0),
        status: (queueStats.failed ?? 0) > 5 ? 'degraded' : 'healthy',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Users Directory with submission statistics
   */
  async getUsers(search?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search && search.trim()) {
      const term = search.trim();
      where['OR'] = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.db.user.count({ where }),
      this.db.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
          documents: {
            where: { isDeleted: false },
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const items: AdminUserListItem[] = users.map((user) => {
      const totalDocs = user.documents.length;
      const completedDocs = user.documents.filter((d) => d.status === DocumentStatus.COMPLETED).length;
      const queuedDocs = user.documents.filter((d) => d.status === DocumentStatus.QUEUED).length;
      const processingDocs = user.documents.filter((d) => d.status === DocumentStatus.PROCESSING).length;
      const failedDocs = user.documents.filter((d) => d.status === DocumentStatus.FAILED).length;
      const successRate = totalDocs > 0 ? Math.round((completedDocs / totalDocs) * 100) : 0;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        totalDocuments: totalDocs,
        completedDocuments: completedDocs,
        queuedDocuments: queuedDocs,
        processingDocuments: processingDocs,
        failedDocuments: failedDocs,
        successRate,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detailed breakdown of all submissions for a single user
   */
  async getUserDocuments(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const documents = await this.db.document.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        originalFileName: true,
        mimeType: true,
        fileSizeBytes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            processingStatus: true,
            processingStage: true,
            processingError: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });

    return {
      user,
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        originalFileName: doc.originalFileName,
        mimeType: doc.mimeType,
        fileSizeBytes: doc.fileSizeBytes,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        latestVersion: doc.versions[0] ?? null,
      })),
    };
  }

  /**
   * System-wide document listing across all users
   */
  async getAllDocuments(params: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isDeleted: false };

    if (params.status && params.status !== 'ALL') {
      where['status'] = params.status as DocumentStatus;
    }

    if (params.search && params.search.trim()) {
      const term = params.search.trim();
      where['OR'] = [
        { title: { contains: term, mode: 'insensitive' } },
        { originalFileName: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, documents] = await Promise.all([
      this.db.document.count({ where }),
      this.db.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              processingStatus: true,
              processingStage: true,
              processingError: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      }),
    ]);

    return {
      items: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        originalFileName: doc.originalFileName,
        mimeType: doc.mimeType,
        fileSizeBytes: doc.fileSizeBytes,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        user: doc.user,
        latestVersion: doc.versions[0] ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Queue & Worker Engine diagnostics
   */
  async getQueueDetails() {
    const stats = await this.queueService.getQueueStats();

    // Get recent failed or stuck documents in database
    const stuckDocuments = await this.db.document.findMany({
      where: {
        isDeleted: false,
        status: { in: [DocumentStatus.FAILED, DocumentStatus.QUEUED] },
      },
      take: 15,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { email: true, name: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            processingStatus: true,
            processingError: true,
            processingErrorCode: true,
          },
        },
      },
    });

    return {
      stats,
      stuckDocuments: stuckDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
        status: doc.status,
        userEmail: doc.user?.email ?? 'Unknown',
        error: doc.versions[0]?.processingError ?? null,
        updatedAt: doc.updatedAt,
      })),
      redisConfig: {
        prefix: process.env['REDIS_PREFIX'] ?? 'docsaarthi:',
        isTls: (process.env['REDIS_URL'] ?? '').startsWith('rediss://'),
      },
    };
  }

  /**
   * Bulk action: Re-enqueue all failed or stuck documents
   */
  async retryAllFailed(adminUserId: string) {
    const failedDocs = await this.db.document.findMany({
      where: {
        isDeleted: false,
        status: { in: [DocumentStatus.FAILED, DocumentStatus.QUEUED] },
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    let retriedCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const doc of failedDocs) {
      const version = doc.versions[0];
      if (!version || !version.storageKey) continue;

      try {
        await this.db.document.update({
          where: { id: doc.id },
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

        await this.queueService.enqueueDocumentProcessing({
          documentId: doc.id,
          versionId: version.id,
          userId: doc.userId,
          storageKey: version.storageKey,
          mimeType: doc.mimeType,
          requestId: `admin-bulk-retry-${Date.now()}`,
        });

        retriedCount++;
      } catch (err) {
        errors.push({ id: doc.id, error: String(err) });
      }
    }

    await this.auditService.log({
      eventType: 'ADMIN_BULK_RETRY_FAILED',
      actorId: adminUserId,
      resourceType: 'DOCUMENT',
      resourceId: 'bulk',
      changes: { retriedCount, totalFound: failedDocs.length },
    });

    return {
      totalFound: failedDocs.length,
      retriedCount,
      errors,
      message: `Enqueued ${retriedCount} document(s) for reprocessing.`,
    };
  }

  /**
   * Activate or disable user account
   */
  async toggleUserStatus(userId: string, isActive: boolean, adminUserId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.email.toLowerCase() === 'keshavagrawal273@gmail.com') {
      throw new BadRequestException('Cannot disable the primary administrator account');
    }

    const updated = await this.db.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });

    await this.auditService.log({
      eventType: 'ADMIN_USER_STATUS_TOGGLE',
      actorId: adminUserId,
      resourceType: 'USER',
      resourceId: userId,
      changes: { previous: user.isActive, current: isActive },
    });

    return updated;
  }
}
