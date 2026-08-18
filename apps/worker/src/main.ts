import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerAppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');

  // Worker doesn't need an HTTP server — we use a headless NestJS app
  const app = await NestFactory.createApplicationContext(WorkerAppModule);
  app.enableShutdownHooks();

  logger.log('DocSaarthi Worker started. Listening on queues: document-processing');
}

bootstrap().catch((err) => {
  console.error('Fatal error in worker bootstrap:', err);
  process.exit(1);
});
