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
}
