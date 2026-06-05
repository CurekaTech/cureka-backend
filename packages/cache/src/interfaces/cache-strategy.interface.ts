import { CacheModuleName } from '../enums/cache-module.enum';
import { CacheStrategyType } from '../enums/cache-strategy.enum';

export interface ICacheAsideOptions<T> {
  key: string;
  loader: () => Promise<T>;
  module?: CacheModuleName;
  ttlSeconds?: number;
}

export interface IWriteThroughOptions<T> {
  /** DB mutation — PostgreSQL remains source of truth. */
  persist: () => Promise<T>;
  /** Keys to refresh immediately after a successful write. */
  refreshEntries?: Array<{
    key: string;
    resolve: (result: T) => Promise<unknown> | unknown;
    module?: CacheModuleName;
    ttlSeconds?: number;
  }>;
  /** Wildcard patterns to invalidate after write (e.g. products:list:*). */
  invalidatePatterns?: string[];
  invalidateKeys?: string[];
}

export interface IInvalidateOnlyOptions {
  patterns?: string[];
  keys?: string[];
}

export interface ICacheRefreshOptions<T> {
  key: string;
  loader: () => Promise<T>;
  module?: CacheModuleName;
  ttlSeconds?: number;
}

export interface ICacheOperationMeta {
  strategy: CacheStrategyType;
  key?: string;
  pattern?: string;
  module?: CacheModuleName;
  durationMs?: number;
  cacheHit?: boolean;
  redisAvailable: boolean;
}
