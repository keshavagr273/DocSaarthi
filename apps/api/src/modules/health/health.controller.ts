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
  @ApiOperation({ summary: 'Health check — returns status of all services and latency' })
  async check() {
    // Database
    let dbStatus = 'down';
    let dbDuration = 0;
    try {
      const start = Date.now();
      const isUp = await this.db.isHealthy();
      dbDuration = Date.now() - start;
      dbStatus = isUp ? 'up' : 'down';
    } catch {
      dbStatus = 'down';
    }

    // Storage
    let storageStatus = 'down';
    let storageDuration = 0;
    try {
      const start = Date.now();
      const isUp = await this.storage.isHealthy();
      storageDuration = Date.now() - start;
      storageStatus = isUp ? 'up' : 'down';
    } catch {
      storageStatus = 'down';
    }

    // LLM Provider Status
    const hasKey = Boolean(process.env['OPENAI_API_KEY']);

    // Queue stats
    let queueStats = null;
    try {
      queueStats = await this.queue.getQueueStats();
    } catch {
      queueStats = { active: 0, waiting: 0, completed: 0, failed: 0 };
    }

    const overallStatus = dbStatus === 'up' ? 'ok' : 'degraded';

    return {
      status: overallStatus,
      info: {
        database: {
          status: dbStatus,
          responseMs: dbDuration,
        },
        storage: {
          status: storageStatus,
          responseMs: storageDuration,
        },
        llmProvider: {
          status: hasKey ? 'up' : 'down',
          provider: process.env['DEFAULT_LLM_PROVIDER'] ?? 'groq',
          model: process.env['DEFAULT_LLM_MODEL'] ?? 'openai/gpt-oss-20b',
        },
        queues: {
          status: 'up',
          details: {
            'document-processing': queueStats,
          },
        },
      },
      timestamp: new Date().toISOString(),
    };
  }
}
