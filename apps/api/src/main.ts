import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : config.get<number>('PORT', 3001);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');

  // ── Security ────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false, // Disabled for Swagger UI
    }),
  );

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.includes(',') ? corsOrigin.split(',').map((o) => o.trim()) : corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  });

  app.use(cookieParser());

  // ── Global prefix ───────────────────────────────────────────
  app.setGlobalPrefix('api/v1', { exclude: ['api/docs', 'api/health'] });

  // ── Global pipes ────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters & interceptors ───────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // ── Swagger ─────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('DocSaarthi API')
    .setDescription('Multilingual Indian Document Intelligence Platform')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addCookieAuth('access_token')
    .addTag('auth', 'Authentication endpoints')
    .addTag('documents', 'Document management')
    .addTag('users', 'User management')
    .addTag('health', 'Health check')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port, '0.0.0.0');
  const appUrl = process.env['RENDER_EXTERNAL_URL'] || `http://localhost:${port}`;
  logger.log(`DocSaarthi API running on port ${port} (0.0.0.0) → ${appUrl}`);
  logger.log(`Swagger UI: ${appUrl}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
