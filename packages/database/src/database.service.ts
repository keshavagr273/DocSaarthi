import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor() {
    // `{ emit: 'event', level: 'query' }` was configured with no listener ever
    // attached, so Prisma serialised an event object for every single query —
    // and the pipeline issues hundreds per document — with nothing consuming
    // them. Emit query logs to stdout only when explicitly asked for.
    const logQueries = process.env['PRISMA_LOG_QUERIES'] === 'true';

    super({
      log: [
        ...(logQueries ? ([{ emit: 'stdout', level: 'query' }] as const) : []),
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    await this.$connect();
    this.logger.log('Database connected.');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
  }

  /** Health check — returns true if DB is reachable */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
