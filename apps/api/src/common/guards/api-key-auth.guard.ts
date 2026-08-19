import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '@docsaarthi/database';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer dsk_live_')) {
      return false;
    }

    const rawKey = authHeader.replace('Bearer ', '').trim();
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.db.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // Attach authenticated user to request
    request.user = {
      sub: apiKey.user.id,
      email: apiKey.user.email,
      role: apiKey.user.role,
      apiKeyId: apiKey.id,
    };

    // Update lastUsedAt in background
    this.db.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {
      // non-blocking
    });

    return true;
  }
}
