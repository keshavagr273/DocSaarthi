import { z } from 'zod';

export const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PREFIX: z.string().default('docsaarthi:'),

  // Storage
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default('docsaarthi_minio'),
  MINIO_SECRET_KEY: z.string().default('docsaarthi_minio_secret'),
  MINIO_BUCKET: z.string().default('docsaarthi'),
  MINIO_USE_SSL: z.string().transform((v) => v === 'true').default('false'),
  MINIO_PRESIGN_EXPIRY_SECONDS: z.coerce.number().default(3600),

  // JWT
  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 chars'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_EXPIRY_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_EXPIRY_SECONDS: z.coerce.number().default(604800),

  // Cookie
  COOKIE_SECURE: z.string().transform((v) => v === 'true').default('false'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // AI — LLM (Groq via OpenAI-compat endpoint)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  DEFAULT_LLM_PROVIDER: z.string().default('groq'),
  DEFAULT_LLM_MODEL: z.string().default('groq/compound-mini'),

  // AI — Vision (Gemini via OpenAI-compat endpoint)
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().optional(),
  DEFAULT_VISION_MODEL: z.string().default('gemini-2.5-flash'),

  // AI — Embeddings (Cohere embed-v4.0 or OpenAI text-embedding-3-small)
  COHERE_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.string().default('cohere'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().optional(),
  DEFAULT_EMBEDDING_MODEL: z.string().default('embed-v4.0'),
  EMBEDDING_DIMENSION: z.coerce.number().default(1536),

  // OCR
  OCR_PROVIDER: z.string().default('paddle'),
  OCR_PADDLE_URL: z.string().default('http://localhost:8081'),
  OCR_FALLBACK_THRESHOLD: z.coerce.number().default(0.7),

  // Limits
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(52428800),
  MAX_PAGES_PER_DOCUMENT: z.coerce.number().default(100),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('debug'),
});

export type Env = z.infer<typeof envSchema>;
