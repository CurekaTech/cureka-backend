import type { RedisOptions } from 'ioredis';

export const buildRedisClientOptions = (options: {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: boolean;
  connectTimeoutMs?: number;
}): RedisOptions => ({
  host: options.host,
  port: options.port,
  username: options.username || undefined,
  password: options.password || undefined,
  tls: options.tls ? {} : undefined,
  lazyConnect: true,
  connectTimeout: options.connectTimeoutMs ?? 5000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  // Stop infinite reconnect loops when Redis is not running locally.
  retryStrategy: (times) => (times > 2 ? null : Math.min(times * 500, 1500)),
});
