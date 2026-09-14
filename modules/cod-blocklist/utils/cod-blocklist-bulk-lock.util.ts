import type Redis from 'ioredis';

export const COD_BLOCKLIST_BULK_LOCK_KEY = 'locks:cod-blocklist-bulk-upload';

export async function releaseCodBlocklistBulkLock(
  redis: Redis,
  token: string,
): Promise<boolean> {
  const released = await redis.eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then
       return redis.call("del", KEYS[1])
     end
     return 0`,
    1,
    COD_BLOCKLIST_BULK_LOCK_KEY,
    token,
  );
  return Number(released) === 1;
}

export async function renewCodBlocklistBulkLock(
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
    COD_BLOCKLIST_BULK_LOCK_KEY,
    token,
    ttlMs,
  );
  return Number(renewed) === 1;
}

export async function forceReleaseCodBlocklistBulkLock(redis: Redis): Promise<boolean> {
  const deleted = await redis.del(COD_BLOCKLIST_BULK_LOCK_KEY);
  return Number(deleted) === 1;
}

export const codBlocklistBulkCancelKey = (uploadRefId: string): string =>
  `cod-blocklist-bulk-upload:cancel:${uploadRefId}`;

const CANCEL_TTL_MS = 24 * 60 * 60 * 1000;

export async function markCodBlocklistBulkCancelled(
  redis: Redis,
  uploadRefId: string,
  ttlMs = CANCEL_TTL_MS,
): Promise<void> {
  await redis.set(codBlocklistBulkCancelKey(uploadRefId), '1', 'PX', ttlMs);
}

export async function isCodBlocklistBulkCancelled(
  redis: Redis | null,
  uploadRefId: string,
): Promise<boolean> {
  if (!redis) return false;
  const value = await redis.get(codBlocklistBulkCancelKey(uploadRefId));
  return value === '1';
}
