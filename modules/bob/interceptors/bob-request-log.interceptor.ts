import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';

@Injectable()
export class BobRequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(BobRequestLogInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const method = request.method;
    const url = request.url?.split('?')[0] ?? request.url;
    const started = Date.now();
    const hasGuestId = Boolean(
      request.headers['x-guest-id'] || request.headers['x-bob-api-key'],
    );
    this.logger.log({ method, url, hasGuestId }, '[BOB inbound] request');

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            { method, url, elapsedMs: Date.now() - started },
            '[BOB inbound] ok',
          );
        },
        error: (error: unknown) => {
          this.logger.warn(
            {
              method,
              url,
              elapsedMs: Date.now() - started,
              error: error instanceof Error ? error.message : String(error),
            },
            '[BOB inbound] failed',
          );
        },
      }),
    );
  }
}
