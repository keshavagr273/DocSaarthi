import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService, Prisma } from '@docsaarthi/database';

export interface AuditEventInput {
  eventType: string;
  actorId?: string;
  resourceType: string;
  resourceId: string;
  documentId?: string;
  changes?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface QueryAuditLogsDto {
  eventType?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  async log(input: AuditEventInput): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          eventType: input.eventType,
          actorId: input.actorId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          documentId: input.documentId,
          changes: input.changes ?? undefined,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          requestId: input.requestId,
        },
      });
    } catch (err) {
      // Audit log failure should never break the main request
      this.logger.error(`Failed to write audit log [${input.eventType}]: ${String(err)}`);
    }
  }

  async queryAuditLogs(userId: string, filters: QueryAuditLogsDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      actorId: userId,
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
