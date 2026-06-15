import { Injectable, Logger } from '@nestjs/common';
import { CacheInvalidationService } from './cache-invalidation.service';
import { CacheService } from './cache.service';
import { CacheTtlService } from './cache-ttl.service';
import { CacheStrategyType } from './enums/cache-strategy.enum';
import { CacheModuleName } from './enums/cache-module.enum';
import {
  ICacheAsideOptions,
  ICacheOperationMeta,
  IInvalidateOnlyOptions,
  IWriteThroughOptions,
} from './interfaces/cache-strategy.interface';
import { RedisConnectionService } from './redis-connection.service';

@Injectable()
export class CacheStrategyService {
  private readonly logger = new Logger(CacheStrategyService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly invalidation: CacheInvalidationService,
    private readonly cacheTtl: CacheTtlService,
    private readonly redisConnection: RedisConnectionService,
  ) {}

  /** Read-through cache-aside. PostgreSQL loader always remains source of truth. */
  async cacheAside<T>(options: ICacheAsideOptions<T>): Promise<T> {
    const startedAt = Date.now();
    const ttlSeconds =
      options.ttlSeconds ?? this.cacheTtl.forModule(options.module ?? CacheModuleName.DEFAULT);

    const { value, cacheHit } = await this.cacheService.getOrSet(
      options.key,
      options.loader,
      ttlSeconds,
    );

    this.logOperation({
      strategy: CacheStrategyType.CACHE_ASIDE,
      key: options.key,
      module: options.module,
      durationMs: Date.now() - startedAt,
      cacheHit,
      redisAvailable: this.redisConnection.isAvailable(),
    });

    return value;
  }

  /** Invalidate cache entries without touching PostgreSQL. */
  async invalidateOnly(options: IInvalidateOnlyOptions): Promise<void> {
    const startedAt = Date.now();

    if (options.keys?.length) {
      await this.invalidation.invalidateKeys(options.keys);
    }
    if (options.patterns?.length) {
      await this.invalidation.invalidateByPatterns(options.patterns);
    }

    this.logOperation({
      strategy: CacheStrategyType.INVALIDATE_ONLY,
      pattern: options.patterns?.join(','),
      durationMs: Date.now() - startedAt,
      redisAvailable: this.redisConnection.isAvailable(),
    });
  }

  /**
   * Write-through for heavy-read APIs.
   * 1. Persist to PostgreSQL
   * 2. Invalidate list/detail patterns
   * 3. Refresh hot keys immediately
   */
  async writeThrough<T>(options: IWriteThroughOptions<T>): Promise<T> {
    const startedAt = Date.now();
    const result = await options.persist();

    if (options.invalidateKeys?.length) {
      await this.invalidation.invalidateKeys(options.invalidateKeys);
    }
    if (options.invalidatePatterns?.length) {
      await this.invalidation.invalidateByPatterns(options.invalidatePatterns);
    }

    if (options.refreshEntries?.length) {
      await Promise.all(
        options.refreshEntries.map(async (entry) => {
          const value = await entry.resolve(result);
          const ttlSeconds =
            entry.ttlSeconds ?? this.cacheTtl.forModule(entry.module ?? CacheModuleName.DEFAULT);
          await this.cacheService.set(entry.key, value, ttlSeconds);
        }),
      );
    }

    this.logOperation({
      strategy: CacheStrategyType.WRITE_THROUGH,
      pattern: options.invalidatePatterns?.join(','),
      durationMs: Date.now() - startedAt,
      redisAvailable: this.redisConnection.isAvailable(),
    });

    return result;
  }

  private logOperation(meta: ICacheOperationMeta): void {
    this.logger.debug(
      JSON.stringify({
        msg: 'cache-operation',
        ...meta,
      }),
    );
  }
}
