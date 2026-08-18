import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const response = context.switchToHttp().getResponse<{
      setHeader: (key: string, value: string) => void;
    }>();

    const requestId =
      (request.headers as Record<string, string>)['x-request-id'] ?? uuidv4();

    (request as Record<string, unknown>)['requestId'] = requestId;
    response.setHeader('X-Request-Id', requestId);

    return next.handle();
  }
}
