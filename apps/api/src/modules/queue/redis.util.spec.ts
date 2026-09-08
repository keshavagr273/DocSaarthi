import { getBullRedisConfig } from '@docsaarthi/shared';

describe('getBullRedisConfig', () => {
  it('should parse standard local Redis URL correctly', () => {
    const config = getBullRedisConfig('redis://localhost:6379');
    expect(config.url).toBe('redis://localhost:6379');
    expect(config.redis.host).toBe('localhost');
    expect(config.redis.port).toBe(6379);
    expect(config.redis.tls).toBeUndefined();
    expect(config.redis.maxRetriesPerRequest).toBeNull();
    expect(config.redis.enableReadyCheck).toBe(false);
  });

  it('should parse authenticated Redis URL with database number', () => {
    const config = getBullRedisConfig('redis://:mySecretPassword@redis.render.com:6380/2', 'testprefix:');
    expect(config.redis.host).toBe('redis.render.com');
    expect(config.redis.port).toBe(6380);
    expect(config.redis.password).toBe('mySecretPassword');
    expect(config.redis.db).toBe(2);
    expect(config.prefix).toBe('testprefix:');
    expect(config.redis.tls).toBeUndefined();
  });

  it('should parse secure rediss:// (TLS) URL with username and password and set TLS options', () => {
    const config = getBullRedisConfig('rediss://default:upstashToken123@us1-fly-redis.upstash.io:6379');
    expect(config.url).toBe('rediss://default:upstashToken123@us1-fly-redis.upstash.io:6379');
    expect(config.redis.host).toBe('us1-fly-redis.upstash.io');
    expect(config.redis.port).toBe(6379);
    expect(config.redis.username).toBe('default');
    expect(config.redis.password).toBe('upstashToken123');
    expect(config.redis.tls).toEqual({ rejectUnauthorized: false });
    expect(config.redis.maxRetriesPerRequest).toBeNull();
    expect(config.redis.enableReadyCheck).toBe(false);
  });
});
