import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { RedisConnectionService } from './redis-connection.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly redisConnection: RedisConnectionService,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const result = await this.safeOp(`get:${key}`, async () => this.cache.get<T>(key));
    return result.status === 'ok' ? result.value : undefined;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    const result = await this.safeOp(`set:${key}`, async () => {
      const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : undefined;
      await this.cache.set(key, value, ttlMs);
    });
    return result.status === 'ok';
  }

  async del(key: string): Promise<void> {
    await this.safeOp(`del:${key}`, async () => {
      await this.cache.del(key);
    });
  }

  /**
   * Low-level cache-aside helper used by CacheStrategyService.
   * Falls back to loader when Redis is unavailable.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<{ value: T; cacheHit: boolean }> {
    if (!this.redisConnection.isReachable()) {
      return { value: await factory(), cacheHit: false };
    }

    const cached = await this.safeOp(`get:${key}`, async () => this.cache.get<T>(key));
    if (cached.status === 'unavailable') {
      return { value: await factory(), cacheHit: false };
    }
    if (cached.status === 'ok' && cached.value !== undefined) {
      return { value: cached.value, cacheHit: true };
    }

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) {
      return { value: await pending, cacheHit: false };
    }

    const loadPromise = (async () => {
      const value = await factory();

      if (this.redisConnection.isReachable()) {
        await this.set(key, value, ttlSeconds);
      }

      return value;
    })();

    this.inFlight.set(key, loadPromise);

    try {
      return { value: await loadPromise, cacheHit: false };
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async safeOp<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<{ status: 'ok'; value: T } | { status: 'unavailable' }> {
    if (!this.redisConnection.isReachable()) {
      return { status: 'unavailable' };
    }

    try {
      const value = await this.redisConnection.withTimeout(operation, label);
      return { status: 'ok', value };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${label} failed: ${message}`);
      this.redisConnection.markDegraded(message);
      return { status: 'unavailable' };
    }
  }
}
