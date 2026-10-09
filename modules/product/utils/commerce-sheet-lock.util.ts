import type Redis from 'ioredis';

export interface ICommerceSheetLock {
  lockKey: string;
  release(redis: Redis, token: string): Promise<boolean>;
  renew(redis: Redis, token: string, ttlMs: number): Promise<boolean>;
  forceRelease(redis: Redis): Promise<boolean>;
  markCancelled(redis: Redis, uploadRefId: string): Promise<void>;
  isCancelled(redis: Redis | null, uploadRefId: string): Promise<boolean>;
}

const CANCEL_TTL_MS = 24 * 60 * 60 * 1000;

export function createCommerceSheetLock(lockKey: string, cancelPrefix: string): ICommerceSheetLock {
  const cancelKey = (uploadRefId: string) => `${cancelPrefix}${uploadRefId}`;

  return {
    lockKey,
    async release(redis, token) {
      const released = await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then
           return redis.call("del", KEYS[1])
         end
         return 0`,
        1,
        lockKey,
        token,
      );
      return Number(released) === 1;
    },
    async renew(redis, token, ttlMs) {
      const renewed = await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then
           return redis.call("pexpire", KEYS[1], ARGV[2])
         end
         return 0`,
        1,
        lockKey,
        token,
        ttlMs,
      );
      return Number(renewed) === 1;
    },
    async forceRelease(redis) {
      const deleted = await redis.del(lockKey);
      return Number(deleted) === 1;
    },
    async markCancelled(redis, uploadRefId, ttlMs = CANCEL_TTL_MS) {
      await redis.set(cancelKey(uploadRefId), '1', 'PX', ttlMs);
    },
    async isCancelled(redis, uploadRefId) {
      if (!redis) return false;
      const value = await redis.get(cancelKey(uploadRefId));
      return value === '1';
    },
  };
}
