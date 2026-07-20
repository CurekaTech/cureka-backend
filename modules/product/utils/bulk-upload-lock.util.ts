import type Redis from 'ioredis';

export const BULK_UPLOAD_LOCK_KEY = 'locks:bulk-upload';

export async function releaseBulkUploadLock(
  redis: Redis,
  token: string,
): Promise<boolean> {
  const released = await redis.eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then
       return redis.call("del", KEYS[1])
     end
     return 0`,
    1,
    BULK_UPLOAD_LOCK_KEY,
    token,
  );
  return Number(released) === 1;
}

export async function renewBulkUploadLock(
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
    BULK_UPLOAD_LOCK_KEY,
    token,
    ttlMs,
  );
  return Number(renewed) === 1;
}
