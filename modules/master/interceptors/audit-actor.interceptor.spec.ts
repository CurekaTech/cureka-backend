import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, Observable } from 'rxjs';
import { getAuditActor, runAsSystem, AuditActor } from '../utils/audit-actor.context';
import { AuditActorInterceptor } from './audit-actor.interceptor';

function httpContext(user: unknown): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ user, ip: '127.0.0.1', id: 'req-1', headers: {} }),
    }),
  } as unknown as ExecutionContext;
}

describe('AuditActorInterceptor', () => {
  const interceptor = new AuditActorInterceptor();

  function captureActor(context: ExecutionContext): Promise<AuditActor | undefined> {
    return lastValueFrom(
      interceptor.intercept(context, {
        handle: () =>
          new Observable<AuditActor | undefined>((subscriber) => {
            subscriber.next(getAuditActor());
            subscriber.complete();
          }),
      }) as Observable<AuditActor | undefined>,
    );
  }

  it('populates an admin actor after authentication', async () => {
    const actor = await captureActor(
      httpContext({ sub: 'admin-1', email: 'admin@cureka.com', role: 'admin' }),
    );
    expect(actor).toMatchObject({ type: 'ADMIN', id: 'admin-1', performedBy: 'admin@cureka.com' });
  });

  it('populates a customer actor after authentication', async () => {
    const actor = await captureActor(
      httpContext({ sub: 'user-1', sessionId: 'session-1', role: 'customer' }),
    );
    expect(actor).toMatchObject({ type: 'USER', id: 'user-1' });
  });

  it('keeps an unauthenticated request anonymous', async () => {
    const actor = await captureActor(httpContext(undefined));
    expect(actor).toMatchObject({ type: 'ANONYMOUS', performedBy: 'anonymous', id: null });
  });

  it('does not let a worker inherit the request actor', async () => {
    const seen = await lastValueFrom(
      interceptor.intercept(httpContext({ sub: 'admin-1', email: 'admin@cureka.com', role: 'super_admin' }), {
        handle: () =>
          new Observable<{ request: AuditActor | undefined; worker: AuditActor | undefined }>((subscriber) => {
            const worker = runAsSystem('bulk-cod-update', () => getAuditActor());
            subscriber.next({ request: getAuditActor(), worker });
            subscriber.complete();
          }),
      }) as Observable<{ request: AuditActor | undefined; worker: AuditActor | undefined }>,
    );
    expect(seen.worker).toMatchObject({ type: 'SYSTEM', performedBy: 'system:bulk-cod-update' });
    expect(seen.request).toMatchObject({ type: 'ADMIN', id: 'admin-1' });
    expect(getAuditActor()).toBeUndefined();
  });
});
