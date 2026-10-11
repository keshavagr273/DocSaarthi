import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { DatabaseService } from '@docsaarthi/database';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queue/queue.service';
import { LlmService } from '../processor/services/llm.service';

/**
 * The LLM probe costs a real API call, and health is polled, so the result is
 * cached briefly. A dead model stays dead for far longer than this window.
 */
const LLM_PROBE_TTL_MS = 60_000;

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly llm: LlmService,
  ) {}

  private llmProbe: { at: number; ok: boolean; detail: string } | null = null;

  private async probeLlm(): Promise<{ ok: boolean; detail: string }> {
    if (this.llmProbe && Date.now() - this.llmProbe.at < LLM_PROBE_TTL_MS) {
      return { ok: this.llmProbe.ok, detail: this.llmProbe.detail };
    }
    const result = await this.llm.checkChatModel();
    this.llmProbe = { at: Date.now(), ...result };
    return result;
  }

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

    // LLM provider. Checking only that a key is present reported "up" while
    // the configured model returned 404 on every call, which is exactly the
    // failure that silently emptied every document's category and fields.
    // Actually call the model.
    let llmStatus = 'down';
    let llmDetail = '';
    let llmDuration = 0;
    try {
      const start = Date.now();
      const probe = await this.probeLlm();
      llmDuration = Date.now() - start;
      llmStatus = probe.ok ? 'up' : 'down';
      llmDetail = probe.detail;
    } catch (err) {
      llmDetail = err instanceof Error ? err.message : String(err);
    }

    // Queue stats
    let queueStats = null;
    try {
      queueStats = await this.queue.getQueueStats();
    } catch {
      queueStats = { active: 0, waiting: 0, completed: 0, failed: 0 };
    }

    // A reachable database is not enough to call this service healthy: with
    // the chat model down, uploads still succeed but produce nothing useful.
    const overallStatus = dbStatus === 'up' && llmStatus === 'up' ? 'ok' : 'degraded';

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
          status: llmStatus,
          provider: process.env['DEFAULT_LLM_PROVIDER'] ?? 'groq',
          model: this.llm.getChatModel(),
          responseMs: llmDuration,
          ...(llmStatus === 'down' ? { error: llmDetail } : {}),
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
