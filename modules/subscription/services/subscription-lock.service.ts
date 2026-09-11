import { Injectable, Logger } from '@nestjs/common';
import { RedisConnectionService } from '@packages/cache';

const LOCK_PREFIX = 'subscription:lock:';

@Injectable()
export class SubscriptionLockService {
  private readonly logger = new Logger(SubscriptionLockService.name);
  private readonly localLocks = new Set<string>();

  constructor(private readonly redis: RedisConnectionService) {}

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
