import type Redis from 'ioredis';
import { BULK_UPLOAD_LOCK_KEY } from './bulk-upload-lock.util';

export const bulkUploadCancelKey = (uploadRefId: string): string =>
  `bulk-upload:cancel:${uploadRefId}`;

export const BULK_UPLOAD_CANCEL_TTL_MS = 24 * 60 * 60 * 1000;

export async function markBulkUploadCancelled(
  redis: Redis,
  uploadRefId: string,
  ttlMs = BULK_UPLOAD_CANCEL_TTL_MS,
): Promise<void> {
  await redis.set(bulkUploadCancelKey(uploadRefId), '1', 'PX', ttlMs);
}

export async function isBulkUploadCancelled(
  redis: Redis | null,
  uploadRefId: string,
): Promise<boolean> {
  if (!redis) {
    return false;
  }
  const value = await redis.get(bulkUploadCancelKey(uploadRefId));
  return value === '1';
}

export async function clearBulkUploadCancelled(
  redis: Redis,
  uploadRefId: string,
): Promise<void> {
  await redis.del(bulkUploadCancelKey(uploadRefId));
}

/** Force-release the global bulk upload lock (admin cancel / recovery). */
export async function forceReleaseBulkUploadLock(redis: Redis): Promise<boolean> {
  const deleted = await redis.del(BULK_UPLOAD_LOCK_KEY);
  return Number(deleted) === 1;
}
