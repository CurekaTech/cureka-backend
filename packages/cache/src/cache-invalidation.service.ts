import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisConnectionService } from './redis-connection.service';
import { ICacheRefreshOptions } from './interfaces/cache-strategy.interface';

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly redisConnection: RedisConnectionService,
  ) {}

  async invalidateKey(key: string): Promise<void> {
    await this.cacheService.del(key);
    this.logger.log(`Cache key invalidated: ${key}`);
  }

  async invalidateKeys(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.invalidateKey(key)));
  }

  /**
   * Pattern-based invalidation using Redis SCAN (safe for production).
   * Example patterns: products:list:*, categories:tree*
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    const client = this.redisConnection.getClient();
    if (!client) {
      this.logger.warn(`Skipped pattern invalidation — Redis unavailable: ${pattern}`);
      return 0;
    }

    let cursor = '0';
    let deleted = 0;

    try {
      do {
        const [nextCursor, keys] = await this.redisConnection.withTimeout(
          () => client.scan(cursor, 'MATCH', pattern, 'COUNT', 100),
          `SCAN ${pattern}`,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          await this.redisConnection.withTimeout(() => client.del(...keys), `DEL ${pattern}`);
          deleted += keys.length;
        }
      } while (cursor !== '0');

      this.logger.log(`Cache pattern invalidated: ${pattern} (${deleted} keys)`);
      return deleted;
    } catch (error) {
      this.logger.error(
        `Pattern invalidation failed for ${pattern}: ${error instanceof Error ? error.message : error}`,
      );
      return deleted;
    }
  }

  async invalidateByPatterns(patterns: string[]): Promise<number> {
    const results = await Promise.all(patterns.map((pattern) => this.invalidateByPattern(pattern)));
    return results.reduce((sum, count) => sum + count, 0);
  }

  /** Force-refresh a cache entry from PostgreSQL (used by write-through sync). */
  async refreshCache<T>(options: ICacheRefreshOptions<T>): Promise<T> {
    const value = await options.loader();
    await this.cacheService.set(options.key, value, options.ttlSeconds);
    this.logger.log(`Cache refreshed: ${options.key}`);
    return value;
  }
}
