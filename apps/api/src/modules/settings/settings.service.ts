import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import * as argon2 from 'argon2';
import { DatabaseService, DocumentStatus, ConfidenceLevel } from '@docsaarthi/database';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../../common/services/cache.service';
import { UpdateProfileDto, ChangePasswordDto, CreateApiKeyDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  // ── Profile Management ────────────────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.db.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.preferredLanguage !== undefined ? { preferredLanguage: dto.preferredLanguage } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        preferredLanguage: true,
        role: true,
        updatedAt: true,
      },
    });

    await this.cache.del(`user:${userId}:profile`);
    await this.audit.log({
      eventType: 'PROFILE_UPDATED',
      actorId: userId,
      resourceType: 'USER',
      resourceId: userId,
      changes: dto as unknown as Record<string, string>,
    });

    return updated;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new BadRequestException('User does not have a local password');
    }

    const isValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword);
    await this.db.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Revoke all sessions and refresh tokens on password change
    await this.db.session.deleteMany({ where: { userId } });
    await this.db.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    await this.audit.log({
      eventType: 'PASSWORD_CHANGED',
      actorId: userId,
      resourceType: 'USER',
      resourceId: userId,
    });

    return { message: 'Password updated successfully. Please log in again.' };
  }

  // ── API Key Management ────────────────────────────────────────────

  async listApiKeys(userId: string) {
    return this.db.apiKey.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApiKey(userId: string, dto: CreateApiKeyDto) {
    const randomHex = randomBytes(24).toString('hex');
    const fullKey = `dsk_live_${randomHex}`;
    const keyHash = createHash('sha256').update(fullKey).digest('hex');
    const keyPrefix = 'dsk_live_';

    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await this.db.apiKey.create({
      data: {
        userId,
        name: dto.name,
        keyHash,
        keyPrefix,
        expiresAt,
      },
    });

    await this.audit.log({
      eventType: 'API_KEY_CREATED',
      actorId: userId,
      resourceType: 'API_KEY',
      resourceId: apiKey.id,
      changes: { name: dto.name, expiresAt },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: fullKey, // returned only this once
      keyPrefix,
      expiresAt,
      createdAt: apiKey.createdAt,
    };
  }

  async revokeApiKey(userId: string, keyId: string) {
    const key = await this.db.apiKey.findFirst({
      where: { id: keyId, userId, isActive: true },
    });

    if (!key) throw new NotFoundException('API key not found');

    await this.db.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    await this.audit.log({
      eventType: 'API_KEY_REVOKED',
      actorId: userId,
      resourceType: 'API_KEY',
      resourceId: keyId,
    });

    return { message: 'API key revoked successfully' };
  }

  // ── Dashboard Aggregated Stats ────────────────────────────────────

  async getDashboardStats(userId: string) {
    return this.cache.getOrSet(
      `dashboard:${userId}:stats`,
      async () => {
        // Document status counts
        const [
          totalDocuments,
          processingCount,
          completedCount,
          failedCount,
          needsReviewFieldsCount,
          totalStorageRes,
          categoriesAgg,
          recentAuditLogs,
          deadlineFields,
        ] = await Promise.all([
          this.db.document.count({ where: { userId, isDeleted: false } }),
          this.db.document.count({
            where: {
              userId,
              isDeleted: false,
              status: { in: [DocumentStatus.PROCESSING, DocumentStatus.QUEUED] },
            },
          }),
          this.db.document.count({
            where: { userId, isDeleted: false, status: DocumentStatus.COMPLETED },
          }),
          this.db.document.count({
            where: { userId, isDeleted: false, status: DocumentStatus.FAILED },
          }),
          this.db.documentField.count({
            where: {
              document: { userId, isDeleted: false },
              confidenceLevel: ConfidenceLevel.LOW,
              isVerified: false,
              isRejected: false,
            },
          }),
          this.db.document.aggregate({
            where: { userId, isDeleted: false },
            _sum: { fileSizeBytes: true },
          }),
          this.db.document.groupBy({
            by: ['category'],
            where: { userId, isDeleted: false },
            _count: true,
          }),
          this.db.auditLog.findMany({
            where: { actorId: userId },
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
              id: true,
              eventType: true,
              resourceType: true,
              resourceId: true,
              createdAt: true,
              document: { select: { title: true } },
            },
          }),
          this.db.documentField.findMany({
            where: {
              document: { userId, isDeleted: false },
              OR: [
                { fieldName: { contains: 'date', mode: 'insensitive' } },
                { fieldName: { contains: 'deadline', mode: 'insensitive' } },
                { fieldName: { contains: 'due', mode: 'insensitive' } },
              ],
              isRejected: false,
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              fieldName: true,
              rawValue: true,
              documentId: true,
              document: { select: { title: true, category: true } },
            },
          }),
        ]);

        const categoryMap = new Map<string, number>();
        for (const c of categoriesAgg) {
          const cat = c.category ?? 'UNKNOWN';
          categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + c._count);
        }
        const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, count]) => ({
          category,
          count,
        }));

        return {
          stats: {
            totalDocuments,
            processingCount,
            completedCount,
            failedCount,
            needsReviewFieldsCount,
            totalStorageBytes: totalStorageRes._sum.fileSizeBytes ?? 0,
          },
          categoryBreakdown,
          recentAuditLogs,
          upcomingDeadlines: deadlineFields,
        };
      },
      120, // 2-minute cache
    );
  }
}
