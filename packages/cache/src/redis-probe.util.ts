import Redis from 'ioredis';

/** One-shot connectivity check used at startup to avoid reconnect spam when Redis is down. */
export async function probeRedis(options: {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: boolean;
  timeoutMs?: number;
}): Promise<boolean> {
  const client = new Redis({
    host: options.host,
    port: options.port,
    username: options.username || undefined,
    password: options.password || undefined,
    tls: options.tls ? {} : undefined,
    lazyConnect: true,
    connectTimeout: options.timeoutMs ?? 2000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  client.on('error', () => {
    // Prevent "[ioredis] Unhandled error event" during probe.
  });

  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG';
  } catch {
    try {
      client.disconnect();
    } catch {
      // ignore disconnect errors after failed probe
    }
    return false;
  }
}
