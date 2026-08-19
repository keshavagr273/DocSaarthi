import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redisClient!: Redis;
  private isConnected = false;

  onModuleInit() {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const prefix = process.env['REDIS_PREFIX'] ?? 'docsaarthi:';

    this.redisClient = new Redis(redisUrl, {
      keyPrefix: `${prefix}cache:`,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
    });

    this.redisClient.on('connect', () => {
      this.isConnected = true;
      this.logger.log('Redis Cache connected successfully');
    });

    this.redisClient.on('error', (err) => {
      this.isConnected = false;
      this.logger.warn(`Redis Cache connection error: ${String(err)}`);
    });
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    try {
      const data = await this.redisClient.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (!this.isConnected) return;
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.redisClient.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.redisClient.set(key, serialized);
      }
    } catch (err) {
      this.logger.warn(`Failed to set cache key "${key}": ${String(err)}`);
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await factory();
    if (fresh !== undefined && fresh !== null) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.redisClient.del(key);
    } catch (err) {
      this.logger.warn(`Failed to delete cache key "${key}": ${String(err)}`);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      const prefix = process.env['REDIS_PREFIX'] ?? 'docsaarthi:';
      const keys = await this.redisClient.keys(`${prefix}cache:${pattern}`);
      if (keys.length > 0) {
        // Strip out the prefix because redisClient adds keyPrefix automatically
        const cleanKeys = keys.map((k) => k.replace(`${prefix}cache:`, ''));
        await this.redisClient.del(...cleanKeys);
        this.logger.debug(`Invalidated ${cleanKeys.length} cache keys matching "${pattern}"`);
      }
    } catch (err) {
      this.logger.warn(`Failed to invalidate pattern "${pattern}": ${String(err)}`);
    }
  }
}
