import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RedisConnectionService } from '@packages/cache';
import { DataSource } from 'typeorm';

const LOCK_PREFIX = 'subscription:lock:';

@Injectable()
export class SubscriptionLockService {
  private readonly logger = new Logger(SubscriptionLockService.name);
  private readonly localLocks = new Set<string>();

  constructor(
    private readonly redis: RedisConnectionService,
    @Optional() @Inject(DataSource) private readonly dataSource?: DataSource,
  ) {}

  async acquire(key: string, ttlMs = 60_000): Promise<boolean> {
    const redisKey = `${LOCK_PREFIX}${key}`;
    const client = await this.redis.getConnectedClient();
    if (client) {
      const result = await client.set(redisKey, '1', 'PX', ttlMs, 'NX');
      return result === 'OK';
    }

    if (this.localLocks.has(redisKey)) {
      this.logger.warn({ key }, 'In-process lock already held (Redis unavailable)');
      return false;
    }
    this.localLocks.add(redisKey);
    setTimeout(() => this.localLocks.delete(redisKey), ttlMs).unref?.();
    return true;
  }

  async release(key: string): Promise<void> {
    const redisKey = `${LOCK_PREFIX}${key}`;
    const client = await this.redis.getConnectedClient();
    if (client) {
      await client.del(redisKey);
    }
    this.localLocks.delete(redisKey);
  }

  /**
   * PostgreSQL transaction advisory lock. Released when the transaction ends.
   * The critical section may call Razorpay; a second caller waits, then sees the committed row.
   */
  async withDbLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (!this.dataSource) {
      throw new Error('Subscription charge lock requires a database connection');
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [
        `subscription:${key}`,
      ]);
      return fn();
    });
  }

  async withLock<T>(key: string, fn: () => Promise<T>, ttlMs = 60_000): Promise<T | null> {
    const acquired = await this.acquire(key, ttlMs);
    if (!acquired) return null;
    try {
      return await fn();
    } finally {
      await this.release(key);
    }
  }
}
