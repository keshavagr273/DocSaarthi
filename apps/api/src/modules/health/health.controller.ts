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
  @ApiOperation({ summary: 'Health check — returns status of all services' })
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Database
      async () => {
        const isUp = await this.db.isHealthy();
        return {
          database: {
            status: isUp ? ('up' as const) : ('down' as const),
            message: isUp ? 'Database is reachable' : 'Database unreachable',
          },
        };
      },

      // Storage (MinIO)
      async () => {
        const isUp = await this.storage.isHealthy();
        return {
          storage: {
            status: isUp ? ('up' as const) : ('down' as const),
            message: isUp ? 'MinIO is reachable' : 'MinIO unreachable',
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
