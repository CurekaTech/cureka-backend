import { ServiceUnavailableException } from '@nestjs/common';
import { AuditService } from './audit.service';

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

  it('treats a duplicate idempotency key as a no-op', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AuditService({ create: jest.fn() } as never, {} as never);
    await expect(service.enqueueCritical({ query } as never, input)).resolves.toBeUndefined();
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT ("idempotency_key") DO NOTHING');
  });
});
