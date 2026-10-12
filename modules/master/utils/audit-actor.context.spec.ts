import { getAuditActor, resolveRequestActor, runAsSystem, runWithActor } from './audit-actor.context';

describe('audit actor context', () => {
  it('identifies admin, customer, and anonymous requests', () => {
    expect(resolveRequestActor({ sub: 'a1', email: 'a@cureka.com', role: 'admin' })).toMatchObject({
      type: 'ADMIN',
      id: 'a1',
      performedBy: 'a@cureka.com',
    });
    expect(resolveRequestActor({ sub: 'u1', sessionId: 's1', role: 'customer' })).toMatchObject({
      type: 'USER',
      id: 'u1',
    });
    expect(resolveRequestActor(undefined)).toMatchObject({ type: 'ANONYMOUS', performedBy: 'anonymous' });
  });

  it('gives a Bull worker a clean SYSTEM actor and restores the request actor afterwards', () => {
    expect(getAuditActor()).toBeUndefined();
    runWithActor(
      {
        type: 'ADMIN',
        id: 'admin-1',
        performedBy: 'admin@cureka.com',
        ipAddress: '127.0.0.1',
        requestId: 'req-1',
      },
      () => {
        const jobActor = runAsSystem('bulk-cod-update', () => getAuditActor());
        expect(jobActor).toMatchObject({ type: 'SYSTEM', id: 'bulk-cod-update', performedBy: 'system:bulk-cod-update' });
        expect(getAuditActor()?.type).toBe('ADMIN');
      },
    );
    expect(getAuditActor()).toBeUndefined();
  });
});
