import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import Redis from 'ioredis';

interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private redisClient!: Redis;
  private isConnected = false;

  constructor() {
    const redisUrl = (process.env['REDIS_URL'] ?? 'redis://localhost:6379').trim();
    const prefix = process.env['REDIS_PREFIX'] ?? 'docsaarthi:';
    const isTls = redisUrl.startsWith('rediss://');

    this.redisClient = new Redis(redisUrl, {
      keyPrefix: `${prefix}ratelimit:`,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    });

    this.redisClient.connect().then(() => {
      this.isConnected = true;
    }).catch((err) => {
      this.logger.warn(`Rate limiter Redis connection failed: ${String(err)}`);
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.isConnected) {
      return true; // fail open if Redis is temporarily unreachable
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const path = req.path;
    const method = req.method;

    // Get client identifier: authenticated user ID, or IP
    const user = (req as unknown as { user?: { sub?: string } }).user;
    const ip = req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0]?.trim()
      : req.ip || '127.0.0.1';

    const identifier = user?.sub ? `user:${user.sub}` : `ip:${ip}`;
    const rule = this.getRuleForPath(method, path);

    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % rule.windowSeconds);
    const redisKey = `${identifier}:${method}:${path}:${windowStart}`;

    try {
      const currentCount = await this.redisClient.incr(redisKey);
      if (currentCount === 1) {
        await this.redisClient.expire(redisKey, rule.windowSeconds + 2);
      }

      const remaining = Math.max(0, rule.limit - currentCount);
      const resetTime = windowStart + rule.windowSeconds;

      res.setHeader('X-RateLimit-Limit', rule.limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime);

      if (currentCount > rule.limit) {
        const retryAfter = Math.max(1, resetTime - now);
        res.setHeader('Retry-After', retryAfter);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
            retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      return true;
    }
  }

  private getRuleForPath(method: string, path: string): RateLimitRule {
    if (path.includes('/auth/login') || path.includes('/auth/register')) {
      return { limit: 10, windowSeconds: 900 }; // 10 attempts per 15 min
    }
    if (path.includes('/documents') && method === 'POST') {
      return { limit: 20, windowSeconds: 60 }; // 20 uploads per minute
    }
    if (path.includes('/conversations') && path.includes('/messages')) {
      return { limit: 40, windowSeconds: 60 }; // 40 chat messages per minute
    }
    if (path.includes('/search')) {
      return { limit: 80, windowSeconds: 60 }; // 80 searches per minute
    }
    if (path.includes('/review')) {
      return { limit: 150, windowSeconds: 60 }; // 150 verification actions per minute
    }
    return { limit: 150, windowSeconds: 60 }; // General fallback
  }
}
