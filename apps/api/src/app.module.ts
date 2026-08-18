import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { DatabaseModule } from '@docsaarthi/database';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { envSchema } from './config/env.schema';

@Module({
  imports: [
    // ── Config (global) ─────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: (config) => {
        const result = envSchema.safeParse(config);
        if (!result.success) {
          const errors = result.error.errors
            .map((e) => `  ${e.path.join('.')}: ${e.message}`)
            .join('\n');
          throw new Error(`Invalid environment variables:\n${errors}`);
        }
        return result.data;
      },
    }),

    // ── Database (global) ────────────────────────────────────
    DatabaseModule,

    // ── BullMQ ───────────────────────────────────────────────
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        prefix: process.env['REDIS_PREFIX'] ?? 'docsaarthi:',
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 200 },
        },
      }),
    }),

    // ── Feature modules ─────────────────────────────────────
    StorageModule,
    QueueModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DocumentsModule,
    HealthModule,
  ],
})
export class AppModule {}
