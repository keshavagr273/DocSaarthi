import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService, VerificationAction, ConfidenceLevel, DocumentStatus } from '@docsaarthi/database';
import { AuditService } from '../audit/audit.service';
import { ListReviewFieldsDto, EditFieldDto, RejectFieldDto } from './dto/review.dto';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ── Review Queue ──────────────────────────────────────────────────

  async getReviewQueue(userId: string, dto: ListReviewFieldsDto) {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = {
      confidenceLevel: ConfidenceLevel.LOW,
      isVerified: false,
      isRejected: false,
      document: {
        userId,
        isDeleted: false,
        status: DocumentStatus.COMPLETED,
        ...(dto.category ? { category: dto.category as never } : {}),
      },
      ...(dto.search
        ? {
            OR: [
              { fieldName: { contains: dto.search, mode: 'insensitive' as const } },
              { rawValue: { contains: dto.search, mode: 'insensitive' as const } },
              { document: { title: { contains: dto.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [total, fields] = await Promise.all([
      this.db.documentField.count({ where }),
      this.db.documentField.findMany({
        where,
        skip,
        take: limit,
        orderBy: { confidence: 'asc' }, // Lowest confidence first for urgent review
        include: {
          document: {
            select: {
              id: true,
              title: true,
              originalFileName: true,
              category: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return {
      fields,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Review Stats ──────────────────────────────────────────────────

  async getReviewStats(userId: string) {
    const [pendingCount, verifiedCount, rejectedCount] = await Promise.all([
      this.db.documentField.count({
        where: {
          confidenceLevel: ConfidenceLevel.LOW,
          isVerified: false,
          isRejected: false,
          document: { userId, isDeleted: false },
        },
      }),
      this.db.documentField.count({
        where: {
          isVerified: true,
          isRejected: false,
          document: { userId, isDeleted: false },
        },
      }),
      this.db.documentField.count({
        where: {
          isRejected: true,
          document: { userId, isDeleted: false },
        },
      }),
    ]);

    return {
      pendingCount,
      verifiedCount,
      rejectedCount,
    };
  }

  // ── Accept Field ──────────────────────────────────────────────────

  async acceptField(userId: string, fieldId: string, requestId?: string) {
    const field = await this.db.documentField.findFirst({
      where: {
        id: fieldId,
        document: { userId, isDeleted: false },
      },
      include: { document: { select: { id: true, title: true } } },
    });

    if (!field) {
      throw new NotFoundException('Field not found or access denied');
    }

    const updated = await this.db.documentField.update({
      where: { id: fieldId },
      data: {
        isVerified: true,
        verifiedBy: userId,
        verifiedAt: new Date(),
        confidenceLevel: ConfidenceLevel.HIGH,
      },
    });

    await this.db.verificationEvent.create({
      data: {
        fieldId,
        userId,
        action: VerificationAction.ACCEPTED,
        previousValue: field.rawValue,
        newValue: field.rawValue,
      },
    });

    await this.audit.log({
      eventType: 'FIELD_ACCEPTED',
      actorId: userId,
      resourceType: 'DOCUMENT_FIELD',
      resourceId: fieldId,
      documentId: field.documentId,
      changes: { fieldName: field.fieldName, rawValue: field.rawValue },
      requestId,
    });

    this.logger.log(`Field ${fieldId} accepted by user ${userId}`);
    return updated;
  }

  // ── Edit Field ────────────────────────────────────────────────────

  async editField(userId: string, fieldId: string, dto: EditFieldDto, requestId?: string) {
    const field = await this.db.documentField.findFirst({
      where: {
        id: fieldId,
        document: { userId, isDeleted: false },
      },
      include: { document: { select: { id: true, title: true } } },
    });

    if (!field) {
      throw new NotFoundException('Field not found or access denied');
    }

    const previousValue = field.rawValue;
    const newValue = dto.newValue.trim();

    const updated = await this.db.documentField.update({
      where: { id: fieldId },
      data: {
        rawValue: newValue,
        confidence: 1.0, // Human verified = 100%
        confidenceLevel: ConfidenceLevel.HIGH,
        isVerified: true,
        verifiedBy: userId,
        verifiedAt: new Date(),
      },
    });

    await this.db.verificationEvent.create({
      data: {
        fieldId,
        userId,
        action: VerificationAction.EDITED,
        previousValue,
        newValue,
        reason: dto.reason,
      },
    });

    await this.audit.log({
      eventType: 'FIELD_EDITED',
      actorId: userId,
      resourceType: 'DOCUMENT_FIELD',
      resourceId: fieldId,
      documentId: field.documentId,
      changes: { fieldName: field.fieldName, previousValue, newValue, reason: dto.reason },
      requestId,
    });

    this.logger.log(`Field ${fieldId} edited by user ${userId}: "${previousValue}" -> "${newValue}"`);
    return updated;
  }

  // ── Reject Field ──────────────────────────────────────────────────

  async rejectField(userId: string, fieldId: string, dto: RejectFieldDto, requestId?: string) {
    const field = await this.db.documentField.findFirst({
      where: {
        id: fieldId,
        document: { userId, isDeleted: false },
      },
      include: { document: { select: { id: true } } },
    });

    if (!field) {
      throw new NotFoundException('Field not found or access denied');
    }

    const updated = await this.db.documentField.update({
      where: { id: fieldId },
      data: {
        isRejected: true,
        isVerified: true,
        verifiedBy: userId,
        verifiedAt: new Date(),
      },
    });

    await this.db.verificationEvent.create({
      data: {
        fieldId,
        userId,
        action: VerificationAction.REJECTED,
        previousValue: field.rawValue,
        reason: dto.reason,
      },
    });

    await this.audit.log({
      eventType: 'FIELD_REJECTED',
      actorId: userId,
      resourceType: 'DOCUMENT_FIELD',
      resourceId: fieldId,
      documentId: field.documentId,
      changes: { fieldName: field.fieldName, rawValue: field.rawValue, reason: dto.reason },
      requestId,
    });

    this.logger.log(`Field ${fieldId} rejected by user ${userId}`);
    return updated;
  }
}
