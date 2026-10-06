import Redis from 'ioredis';
import { buildRedisClientOptions } from '../../../../packages/cache/src/redis-options.util';
import { CacheKeys } from '../../../../packages/cache/src/cache-keys.factory';

export interface RedisCleanupResult {
  connected: boolean;
  keysDeleted: number;
}

const createRedisClient = (): Redis | null => {
  const host = process.env['REDIS_HOST'] || 'localhost';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  const password = process.env['REDIS_PASSWORD'] || undefined;
  const username = process.env['REDIS_USERNAME'] || undefined;
  const tls = process.env['REDIS_TLS'] === 'true';

  return new Redis(
    buildRedisClientOptions({
      host,
      port,
      password,
      username,
      tls,
      lazyConnect: true,
      enableOfflineQueue: false,
    }),
  );
};

const scanAndDelete = async (client: Redis, pattern: string): Promise<number> => {
  let cursor = '0';
  let deleted = 0;

  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      deleted += await client.del(...keys);
    }
  } while (cursor !== '0');

  return deleted;
};

export const invalidateProductCache = async (
  targets: Array<{ refId: string; slug?: string | null }>,
  dryRun: boolean,
): Promise<RedisCleanupResult> => {
  const client = createRedisClient();
  if (!client) {
    return { connected: false, keysDeleted: 0 };
  }

  try {
    await client.connect();
  } catch {
    return { connected: false, keysDeleted: 0 };
  }

  const patterns = [
    CacheKeys.products.listPattern(),
    CacheKeys.products.detailPattern(),
    CacheKeys.products.featuredPattern(),
    CacheKeys.publicProducts.listPattern(),
    CacheKeys.publicProducts.variantSearchPattern(),
    CacheKeys.publicProducts.detailPattern(),
    ...CacheKeys.publicProducts.recommendationPatterns(),
    CacheKeys.publicListingContext.categoryPattern(),
    // Homepage sections embed product cards (pricing.inStock, etc.).
    CacheKeys.homepage.bestSellersPattern(),
    CacheKeys.homepage.sectionsPattern(),
    CacheKeys.homepage.homeSectionsPattern(),
  ];

  const explicitKeys = targets.flatMap(({ refId, slug }) => {
    const keys = [CacheKeys.products.detail(refId)];
    if (slug) {
      keys.push(CacheKeys.publicProducts.detail(slug));
    }
    return keys;
  });

  if (dryRun) {
    await client.quit();
    return { connected: true, keysDeleted: 0 };
  }

  let keysDeleted = 0;
  for (const pattern of patterns) {
    keysDeleted += await scanAndDelete(client, pattern);
  }

  if (explicitKeys.length > 0) {
    keysDeleted += await client.del(...explicitKeys);
  }

  await client.quit();
  return { connected: true, keysDeleted };
};
