import { ServiceUnavailableException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { runWithActor } from '../utils/audit-actor.context';

describe('AuditService critical persistence', () => {
  const input = {
    entityType: 'admin_auth',
    entityId: null,
    action: 'login_failed',
    performedBy: 'anonymous',
    idempotencyKey: 'auth-failure:admin:a***@cureka.com:req-1',
  };

  it('propagates an outbox insert failure so the caller transaction can roll back', async () => {
    const service = new AuditService({ create: jest.fn() } as never, {} as never);
    const manager = { query: jest.fn().mockRejectedValue(new Error('insert failed')) };
    await expect(service.enqueueCritical(manager as never, input)).rejects.toThrow('insert failed');
  });

  it('returns 503 when a standalone critical audit cannot commit', async () => {
    const dataSource = {
      transaction: jest.fn(async (fn: (manager: { query: jest.Mock }) => Promise<void>) =>
        fn({ query: jest.fn().mockRejectedValue(new Error('db down')) }),
      ),
    };
    const service = new AuditService({ create: jest.fn() } as never, dataSource as never);
    await expect(service.persistCritical(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('writes the audit row in the same transaction as the outbox and treats a duplicate key as a no-op', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AuditService({ create: jest.fn() } as never, {} as never);
    await expect(service.enqueueCritical({ query } as never, input)).resolves.toBeUndefined();
    expect(query.mock.calls[0][0]).toContain('INSERT INTO "audit_logs"');
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT ("idempotency_key") WHERE "idempotency_key" IS NOT NULL DO NOTHING');
    expect(query.mock.calls[1][0]).toContain('INSERT INTO "audit_outbox"');
    expect(query.mock.calls[1][0]).toContain('ON CONFLICT ("idempotency_key") DO NOTHING');
  });

  it('keeps an authenticated admin off the anonymous actor', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'row-1' });
    const service = new AuditService({ create } as never, {} as never);
    await runWithActor(
      {
        type: 'ADMIN',
        id: 'admin-1',
        performedBy: 'sahil.admin@cureka.com',
        ipAddress: '127.0.0.1',
        requestId: 'req-1',
      },
      () =>
        service.recordWrite({
          entityType: 'product',
          entityId: 'product-1',
          entityRefId: 'PRO1',
          action: 'published',
          performedBy: 'sahil.admin@cureka.com',
          details: { from: 'inactive', to: 'published' },
        }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'product',
        action: 'published',
        performedBy: 'sahil.admin@cureka.com',
        actorType: 'ADMIN',
        actorId: 'admin-1',
      }),
    );
    expect(create.mock.calls[0][0].performedBy).not.toBe('anonymous');
  });
});
