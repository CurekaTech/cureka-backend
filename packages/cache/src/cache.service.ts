import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { RedisConnectionService } from './redis-connection.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly redisConnection: RedisConnectionService,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.safeOp(`get:${key}`, async () => this.cache.get<T>(key));
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.safeOp(`set:${key}`, async () => {
      const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : undefined;
      await this.cache.set(key, value, ttlMs);
    });
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

    try {
      const cached = await this.get<T>(key);
      if (cached !== undefined) {
        return { value: cached, cacheHit: true };
      }
    } catch (error) {
      this.logger.warn(
        `Cache read failed for ${key}: ${error instanceof Error ? error.message : error}`,
      );
    }

    const value = await factory();

    try {
      await this.set(key, value, ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Cache write failed for ${key}: ${error instanceof Error ? error.message : error}`,
      );
    }

    return { value, cacheHit: false };
  }

  private async safeOp<T>(label: string, operation: () => Promise<T>): Promise<T | undefined> {
    if (!this.redisConnection.isReachable()) {
      return undefined;
    }

    try {
      return await this.redisConnection.withTimeout(operation, label);
    } catch (error) {
      this.logger.warn(`${label} failed: ${error instanceof Error ? error.message : error}`);
      return undefined;
    }
  }
}
