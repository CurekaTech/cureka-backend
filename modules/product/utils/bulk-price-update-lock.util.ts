import type Redis from 'ioredis';

export const BULK_PRICE_UPDATE_LOCK_KEY = 'locks:bulk-price-update';

export async function releaseBulkPriceUpdateLock(
  redis: Redis,
  token: string,
): Promise<boolean> {
  const released = await redis.eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then
       return redis.call("del", KEYS[1])
     end
     return 0`,
    1,
    BULK_PRICE_UPDATE_LOCK_KEY,
    token,
  );
  return Number(released) === 1;
}

export async function renewBulkPriceUpdateLock(
  redis: Redis,
  token: string,
  ttlMs: number,
): Promise<boolean> {
  const renewed = await redis.eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then
       return redis.call("pexpire", KEYS[1], ARGV[2])
     end
     return 0`,
    1,
    BULK_PRICE_UPDATE_LOCK_KEY,
    token,
    ttlMs,
  );
  return Number(renewed) === 1;
}

export async function forceReleaseBulkPriceUpdateLock(redis: Redis): Promise<boolean> {
  const deleted = await redis.del(BULK_PRICE_UPDATE_LOCK_KEY);
  return Number(deleted) === 1;
}

export const bulkPriceUpdateCancelKey = (uploadRefId: string): string =>
  `bulk-price-update:cancel:${uploadRefId}`;

const CANCEL_TTL_MS = 24 * 60 * 60 * 1000;

export async function markBulkPriceUpdateCancelled(
  redis: Redis,
  uploadRefId: string,
  ttlMs = CANCEL_TTL_MS,
): Promise<void> {
  await redis.set(bulkPriceUpdateCancelKey(uploadRefId), '1', 'PX', ttlMs);
}

export async function isBulkPriceUpdateCancelled(
  redis: Redis | null,
  uploadRefId: string,
): Promise<boolean> {
  if (!redis) return false;
  const value = await redis.get(bulkPriceUpdateCancelKey(uploadRefId));
  return value === '1';
}
