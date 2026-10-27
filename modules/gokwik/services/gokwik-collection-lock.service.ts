import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisConnectionService } from '@packages/cache';
import type { Redis } from 'ioredis';

export const GOKWIK_COLLECTION_LOCK_KEY = 'gokwik:collection:lock';

const RENEW_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

/** Thrown when another worker holds the collection lock. The job should delay, not fail. */
export class GokwikCollectionLockBusyError extends Error {
  constructor() {
    super('GoKwik collection sync is waiting for the collection lock');
    this.name = 'GokwikCollectionLockBusyError';
  }
}

@Injectable()
export class GokwikCollectionLockService {
  constructor(
    private readonly redis: RedisConnectionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * One collection POST at a time across PM2 workers.
   * The lease is renewed while the callback runs so a long request cannot expire it.
   */
  async runExclusive<T>(work: (assertOwned: () => Promise<void>) => Promise<T>): Promise<T> {
    const client = await this.redis.getConnectedClient();
    if (!client) throw new GokwikCollectionLockBusyError();

    const ttlMs = this.ttlMs();
    const token = randomUUID();
    const acquired = await client.set(GOKWIK_COLLECTION_LOCK_KEY, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') throw new GokwikCollectionLockBusyError();

    let lost = false;
    const timer = setInterval(() => {
      void this.renew(client, token, ttlMs).then((owned) => {
        if (!owned) lost = true;
      });
    }, Math.max(1_000, Math.floor(ttlMs / 2)));
    timer.unref?.();

    const assertOwned = async (): Promise<void> => {
      if (lost) throw new GokwikCollectionLockBusyError();
      const current = await client.get(GOKWIK_COLLECTION_LOCK_KEY);
      if (current !== token) {
        lost = true;
        throw new GokwikCollectionLockBusyError();
      }
    };

    try {
      return await work(assertOwned);
    } finally {
      clearInterval(timer);
      await client.eval(RELEASE_LUA, 1, GOKWIK_COLLECTION_LOCK_KEY, token).catch(() => undefined);
    }
  }

  /** max(GOKWIK_TIMEOUT_MS, 15s) plus 15s, so the lease outlives one request. */
  ttlMs(): number {
    const configured = this.configService.get<number>('gokwik.timeoutMs') ?? 15_000;
    const timeoutMs = Number.isFinite(configured) ? configured : 15_000;
    return Math.max(timeoutMs, 15_000) + 15_000;
  }

  private async renew(client: Redis, token: string, ttlMs: number): Promise<boolean> {
    const renewed = await client.eval(RENEW_LUA, 1, GOKWIK_COLLECTION_LOCK_KEY, token, String(ttlMs));
    return Number(renewed) === 1;
  }
}
