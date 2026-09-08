/**
 * Redis connection utilities for Bull queue and ioredis clients.
 * Ensures robust connection across standard redis:// and secure rediss:// (TLS) instances (Upstash, Render, etc.).
 */

export interface BullRedisConfig {
  url: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    username?: string;
    db: number;
    tls?: { rejectUnauthorized: boolean };
    maxRetriesPerRequest: null;
    enableReadyCheck: boolean;
  };
  prefix: string;
}

export function getBullRedisConfig(rawUrl?: string, rawPrefix?: string): BullRedisConfig {
  const redisUrl = (rawUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379').trim();
  const isTls = redisUrl.startsWith('rediss://');

  let host = '127.0.0.1';
  let port = 6379;
  let password: string | undefined;
  let username: string | undefined;
  let db = 0;

  try {
    const parsed = new URL(redisUrl);
    host = parsed.hostname || '127.0.0.1';
    port = parsed.port ? parseInt(parsed.port, 10) : 6379;
    password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    if (parsed.pathname && parsed.pathname.length > 1) {
      const dbNum = parseInt(parsed.pathname.slice(1), 10);
      if (!isNaN(dbNum)) db = dbNum;
    }
  } catch {
    // Fallback if URL parsing fails
  }

  return {
    url: redisUrl,
    redis: {
      host,
      port,
      ...(password ? { password } : {}),
      ...(username ? { username } : {}),
      db,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    prefix: (rawPrefix ?? process.env['REDIS_PREFIX'] ?? 'docsaarthi:').trim(),
  };
}
