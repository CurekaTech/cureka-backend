import type { RedisOptions } from 'ioredis';

export const buildRedisClientOptions = (options: {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: boolean;
  connectTimeoutMs?: number;
  /** Use true for on-demand clients; false for cache store after a successful probe. */
  lazyConnect?: boolean;
  enableOfflineQueue?: boolean;
}): RedisOptions => ({
  host: options.host,
  port: options.port,
  username: options.username || undefined,
  password: options.password || undefined,
  tls: options.tls ? {} : undefined,
  lazyConnect: options.lazyConnect ?? false,
  connectTimeout: options.connectTimeoutMs ?? 5000,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: options.enableOfflineQueue ?? false,
  // Stop infinite reconnect loops when Redis is not running locally.
  retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 2000)),
});
