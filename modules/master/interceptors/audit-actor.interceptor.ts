import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FastifyRequest } from 'fastify';
import { resolveTrustedClientIp } from '../utils/audit-ip.util';
import { resolveRequestActor, runWithActor } from '../utils/audit-actor.context';
import { sanitizeRequestPayload } from '../utils/audit-capture.util';

@Injectable()
export class AuditActorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: unknown; id?: string }>();
    const identity = resolveRequestActor(request.user);
    const method = request.method ? String(request.method).toUpperCase() : null;
    const path = request.url ? String(request.url).split('?')[0] : null;
    const mutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
    return new Observable((subscriber) => {
      runWithActor(
        {
          ...identity,
          ipAddress: resolveTrustedClientIp(request),
          requestId: request.id ? String(request.id) : null,
          method,
          path,
          requestPayload: mutating ? sanitizeRequestPayload(request.body, path) : null,
        },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
