import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request & { requestId?: string; user?: { sub?: string } }>();
    const response = ctx.getResponse<Response>();
    const start = Date.now();

    const { method, url, requestId, user } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - start;
          this.logger.log({
            message: `${method} ${url} ${response.statusCode}`,
            method,
            url,
            statusCode: response.statusCode,
            durationMs,
            requestId,
            userId: user?.sub,
          });
        },
        error: (err: Error & { status?: number }) => {
          const durationMs = Date.now() - start;
          this.logger.error({
            message: `${method} ${url} ${err.status ?? 500}`,
            method,
            url,
            statusCode: err.status ?? 500,
            durationMs,
            requestId,
            userId: user?.sub,
            error: err.message,
          });
        },
      }),
    );
  }
}
