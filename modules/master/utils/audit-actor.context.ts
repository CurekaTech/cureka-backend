import { AsyncLocalStorage } from 'async_hooks';

export type AuditActorType = 'ADMIN' | 'USER' | 'SYSTEM' | 'ANONYMOUS';

export interface AuditActor {
  type: AuditActorType;
  id: string | null;
  performedBy: string;
  ipAddress: string | null;
  requestId: string | null;
}

const ADMIN_ROLES = new Set(['super_admin', 'admin', 'moderator']);

const storage = new AsyncLocalStorage<AuditActor>();

export function runWithActor<T>(actor: AuditActor, fn: () => T): T {
  return storage.run(actor, fn);
}

export function runAsSystem<T>(jobName: string, fn: () => T): T {
  return storage.run(
    {
      type: 'SYSTEM',
      id: jobName,
      performedBy: `system:${jobName}`,
      ipAddress: null,
      requestId: null,
    },
    fn,
  );
}

export function getAuditActor(): AuditActor | undefined {
  return storage.getStore();
}

export function resolveRequestActor(user: unknown): Omit<AuditActor, 'ipAddress' | 'requestId'> {
  if (!user || typeof user !== 'object') {
    return { type: 'ANONYMOUS', id: null, performedBy: 'anonymous' };
  }
  const record = user as {
    sub?: string;
    email?: string;
    role?: string;
    sessionId?: string;
  };
  if (record.sessionId && record.sub) {
    return { type: 'USER', id: record.sub, performedBy: record.sub };
  }
  if (record.sub && record.email && record.role && ADMIN_ROLES.has(record.role)) {
    return { type: 'ADMIN', id: record.sub, performedBy: record.email };
  }
  if (record.sub) {
    return { type: 'USER', id: record.sub, performedBy: record.sub };
  }
  return { type: 'ANONYMOUS', id: null, performedBy: 'anonymous' };
}
