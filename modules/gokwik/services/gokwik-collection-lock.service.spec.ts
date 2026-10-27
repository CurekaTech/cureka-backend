import { ConfigService } from '@nestjs/config';
import { RedisConnectionService } from '@packages/cache';
import {
  GOKWIK_COLLECTION_LOCK_KEY,
  GokwikCollectionLockBusyError,
  GokwikCollectionLockService,
} from './gokwik-collection-lock.service';

function createLock(timeoutMs = 60_000) {
  let held: { token: string; ttl: number } | null = null;
  const evals: string[] = [];
  const client = {
    set: jest.fn(async (key: string, token: string, _px: string, ttl: number, _nx: string) => {
      if (key !== GOKWIK_COLLECTION_LOCK_KEY) return null;
      if (held) return null;
      held = { token, ttl };
      return 'OK';
    }),
    get: jest.fn(async () => held?.token ?? null),
    eval: jest.fn(async (script: string, _keys: number, key: string, token: string, ttl?: string) => {
      evals.push(script);
      if (key !== GOKWIK_COLLECTION_LOCK_KEY || held?.token !== token) return 0;
      if (script.includes('pexpire')) {
        held = { token, ttl: Number(ttl) };
        return 1;
      }
      held = null;
      return 1;
    }),
  };
  const service = new GokwikCollectionLockService(
    { getConnectedClient: async () => client } as unknown as RedisConnectionService,
    { get: () => timeoutMs } as unknown as ConfigService,
  );
  return { service, client, evals, isHeld: () => held !== null };
}

describe('GokwikCollectionLockService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a second worker while the first collection call is in progress', async () => {
    const { service } = createLock();
    let releaseFirst!: () => void;
    const first = service.runExclusive(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    await Promise.resolve();

    await expect(service.runExclusive(async () => undefined)).rejects.toBeInstanceOf(
      GokwikCollectionLockBusyError,
    );

    releaseFirst();
    await first;
    await expect(service.runExclusive(async () => 'second')).resolves.toBe('second');
  });

  it('renews the lease with the token while the request is still running', async () => {
    const { service, evals } = createLock(60_000);
    let renew: (() => void) | undefined;
    jest.spyOn(global, 'setInterval').mockImplementation((handler: TimerHandler) => {
      renew = () => {
        if (typeof handler === 'function') handler();
      };
      return 1 as unknown as NodeJS.Timeout;
    });

    let release!: () => void;
    const running = service.runExclusive(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    for (let attempt = 0; attempt < 10 && !renew; attempt += 1) {
      await Promise.resolve();
    }
    expect(renew).toBeDefined();
    renew?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(evals.some((script) => script.includes('pexpire'))).toBe(true);
    release();
    await running;
    expect(evals.some((script) => script.includes("redis.call('del'"))).toBe(true);
  });

  it('does not delete a lock owned by another token', async () => {
    const { service, client } = createLock();
    await service.runExclusive(async () => undefined);
    const releaseCall = client.eval.mock.calls.find((call) => String(call[0]).includes('del'));
    expect(releaseCall?.[0]).toEqual(expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"));
  });

  it('uses a lease longer than a 60 second request timeout', () => {
    const { service } = createLock(60_000);
    expect(service.ttlMs()).toBeGreaterThan(60_000);
  });
});
