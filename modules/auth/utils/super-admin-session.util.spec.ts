import { BadRequestException } from '@nestjs/common';
import {
  AdminSessionAllocation,
  SUPER_ADMIN_SESSION_LIMIT_MESSAGE,
  allocateSuperAdminSessionSlot,
  isSuperAdminSessionAccount,
  parseJwtExpiresInToMilliseconds,
} from './super-admin-session.util';

type Row = {
  id: string;
  adminUserId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

function createStore(now: Date) {
  const rows: Row[] = [];
  let tail: Promise<void> = Promise.resolve();

  const allocation = (): AdminSessionAllocation & { finish: () => void } => {
    let finish: () => void = () => undefined;
    return {
      async lockAdminUser() {
        const previous = tail;
        let release: () => void = () => undefined;
        tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        finish = release;
        await previous;
      },
      async countActive(adminUserId: string) {
        const count = rows.filter(
          (row) =>
            row.adminUserId === adminUserId && row.revokedAt === null && row.expiresAt > now,
        ).length;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return count;
      },
      async insertActive(adminUserId: string, expiresAt: Date) {
        const id = `session-${rows.length + 1}`;
        rows.push({ id, adminUserId, expiresAt, revokedAt: null });
        return id;
      },
      finish() {
        finish();
      },
    };
  };

  const attempt = async (adminUserId: string, expiresAt: Date) => {
    const tx = allocation();
    try {
      return await allocateSuperAdminSessionSlot(tx, adminUserId, expiresAt);
    } finally {
      tx.finish();
    }
  };

  return { rows, attempt };
}

describe('super admin session allocation', () => {
  const adminId = 'admin-1';
  const expiresAt = new Date('2026-10-20T00:00:00.000Z');
  const now = new Date('2026-10-12T00:00:00.000Z');

  it('matches the super admin email after trim and case folding', () => {
    expect(isSuperAdminSessionAccount('  SuperAdmin@Cureka.com ')).toBe(true);
    expect(isSuperAdminSessionAccount('admin@cureka.com')).toBe(false);
  });

  it('parses the same duration strings used to sign admin JWTs', () => {
    expect(parseJwtExpiresInToMilliseconds('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseJwtExpiresInToMilliseconds('15m')).toBe(15 * 60 * 1000);
    expect(parseJwtExpiresInToMilliseconds('1000')).toBe(1000);
  });

  it.each([0, 1, 2])('allows login when %s active sessions exist', async (active) => {
    const store = createStore(now);
    for (let index = 0; index < active; index += 1) {
      store.rows.push({
        id: `existing-${index}`,
        adminUserId: adminId,
        expiresAt,
        revokedAt: null,
      });
    }
    await expect(store.attempt(adminId, expiresAt)).resolves.toBe(`session-${active + 1}`);
  });

  it('rejects the fourth active session', async () => {
    const store = createStore(now);
    for (let index = 0; index < 3; index += 1) {
      store.rows.push({
        id: `existing-${index}`,
        adminUserId: adminId,
        expiresAt,
        revokedAt: null,
      });
    }
    await expect(store.attempt(adminId, expiresAt)).rejects.toBeInstanceOf(BadRequestException);
    await expect(store.attempt(adminId, expiresAt)).rejects.toThrow(SUPER_ADMIN_SESSION_LIMIT_MESSAGE);
    expect(store.rows).toHaveLength(3);
  });

  it('ignores expired and revoked sessions and frees a slot after revoke', async () => {
    const store = createStore(now);
    store.rows.push(
      { id: 'expired', adminUserId: adminId, expiresAt: new Date('2026-10-01T00:00:00.000Z'), revokedAt: null },
      { id: 'revoked', adminUserId: adminId, expiresAt, revokedAt: now },
      { id: 'active-1', adminUserId: adminId, expiresAt, revokedAt: null },
      { id: 'active-2', adminUserId: adminId, expiresAt, revokedAt: null },
      { id: 'active-3', adminUserId: adminId, expiresAt, revokedAt: null },
    );
    await expect(store.attempt(adminId, expiresAt)).rejects.toBeInstanceOf(BadRequestException);
    store.rows.find((row) => row.id === 'active-3')!.revokedAt = now;
    await expect(store.attempt(adminId, expiresAt)).resolves.toBe('session-6');
  });

  it('does not let two concurrent logins pass the two-session boundary', async () => {
    const store = createStore(now);
    store.rows.push(
      { id: 'active-1', adminUserId: adminId, expiresAt, revokedAt: null },
      { id: 'active-2', adminUserId: adminId, expiresAt, revokedAt: null },
    );
    const results = await Promise.allSettled([
      store.attempt(adminId, expiresAt),
      store.attempt(adminId, expiresAt),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(store.rows.filter((row) => row.revokedAt === null && row.expiresAt > now)).toHaveLength(3);
  });
});
