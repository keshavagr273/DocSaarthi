import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    requestId: string;
    timestamp: string;
    details?: unknown;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string) ?? exception.message;
        details = Array.isArray(resp['message']) ? resp['message'] : undefined;
      }

      // Map status to error code
      code = this.statusToCode(status);
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error({
        message: `Unhandled exception: ${exception.message}`,
        stack: exception.stack,
        requestId: request.requestId,
        url: request.url,
        method: request.method,
      });
    }

    // Do not expose internal error details in production
    if (status === HttpStatus.INTERNAL_SERVER_ERROR && process.env['NODE_ENV'] === 'production') {
      message = 'Internal server error';
      details = undefined;
    }

    const body: ErrorResponse = {
      error: {
        code,
        message: Array.isArray(message) ? message.join('; ') : message,
        statusCode: status,
        requestId: request.requestId ?? '',
        timestamp: new Date().toISOString(),
        ...(details ? { details } : {}),
      },
    };

    response.status(status).json(body);
  }

  private statusToCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[status] ?? 'ERROR';
  }
}
