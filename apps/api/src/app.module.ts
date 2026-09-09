import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '@docsaarthi/database';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { ReviewModule } from './modules/review/review.module';
import { SearchModule } from './modules/search/search.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AdminModule } from './modules/admin/admin.module';
import { ProcessorModule } from './modules/processor/processor.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { getBullRedisConfig } from '@docsaarthi/shared';
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

    // ── Bull Queue (Supports Upstash TLS rediss:// & Local Redis) ──
    BullModule.forRootAsync({
      useFactory: () => {
        const config = getBullRedisConfig();
        return {
          url: config.url,
          redis: config.redis,
          prefix: config.prefix,
          defaultJobOptions: {
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 200 },
          },
        };
      },
    }),

    // ── Feature modules ─────────────────────────────────────
    StorageModule,
    QueueModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DocumentsModule,
    ReviewModule,
    SearchModule,
    ConversationsModule,
    SettingsModule,
    HealthModule,
    AdminModule,
    ProcessorModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
