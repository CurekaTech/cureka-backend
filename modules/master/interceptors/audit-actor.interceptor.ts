import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FastifyRequest } from 'fastify';
import { resolveTrustedClientIp } from '../utils/audit-ip.util';
import { resolveRequestActor, runWithActor } from '../utils/audit-actor.context';

@Injectable()
export class AuditActorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: unknown; id?: string }>();
    const identity = resolveRequestActor(request.user);
    return new Observable((subscriber) => {
      runWithActor(
        {
          ...identity,
          ipAddress: resolveTrustedClientIp(request),
          requestId: request.id ? String(request.id) : null,
        },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
