import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { DatabaseService } from '@docsaarthi/database';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queue/queue.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  @Public()
  @Get('api/health')
  @HealthCheck()
  @ApiOperation({ summary: 'Health check — returns status of all services and latency' })
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Database
      async () => {
        const start = Date.now();
        const isUp = await this.db.isHealthy();
        const durationMs = Date.now() - start;
        return {
          database: {
            status: isUp ? ('up' as const) : ('down' as const),
            responseMs: durationMs,
            message: isUp ? 'Database is reachable' : 'Database unreachable',
          },
        };
      },

      // Storage (MinIO)
      async () => {
        const start = Date.now();
        const isUp = await this.storage.isHealthy();
        const durationMs = Date.now() - start;
        return {
          storage: {
            status: isUp ? ('up' as const) : ('down' as const),
            responseMs: durationMs,
            message: isUp ? 'MinIO is reachable' : 'MinIO unreachable',
          },
        };
      },

      // LLM Provider Status
      async () => {
        const hasKey = Boolean(process.env['OPENAI_API_KEY']);
        return {
          llmProvider: {
            status: hasKey ? ('up' as const) : ('down' as const),
            provider: process.env['DEFAULT_LLM_PROVIDER'] ?? 'openai',
            model: process.env['DEFAULT_LLM_MODEL'] ?? 'openai/gpt-oss-20b',
          },
        };
      },

      // Queue stats
      async () => {
        const stats = await this.queue.getQueueStats();
        return {
          queues: {
            status: 'up' as const,
            details: {
              'document-processing': stats,
            },
          },
        };
      },
    ]);
  }
}
