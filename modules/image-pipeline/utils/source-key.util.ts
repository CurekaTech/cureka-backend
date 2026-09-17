import { normalizeStorageKey } from '@packages/storage';
import { IMAGE_PIPELINE_SKIP_FOLDERS } from '../constants/image-pipeline.constants';

const PRIVATE_OR_LINK_LOCAL = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^metadata\.google\.internal$/i,
];

export const isSafeObjectKey = (key: string): boolean => {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    return false;
  }
  if (key.includes('\0') || key.length > 1024) {
    return false;
  }
  return true;
};

export const isDerivativeKey = (key: string, derivativePrefix: string): boolean => {
  const prefix = derivativePrefix.replace(/^\/+|\/+$/g, '');
  return key === prefix || key.startsWith(`${prefix}/`);
};

export const folderOfKey = (key: string): string => {
  const slash = key.indexOf('/');
  return slash === -1 ? '' : key.slice(0, slash);
};

export const shouldSkipSourceKey = (key: string, derivativePrefix: string): boolean => {
  if (!isSafeObjectKey(key)) return true;
  if (isDerivativeKey(key, derivativePrefix)) return true;
  const folder = folderOfKey(key);
  return (IMAGE_PIPELINE_SKIP_FOLDERS as readonly string[]).includes(folder);
};

export const isProcessableImageMime = (mimetype: string | null | undefined): boolean => {
  if (!mimetype) return true;
  const normalized = mimetype.toLowerCase();
  if (normalized.startsWith('video/')) return false;
  if (normalized === 'application/pdf') return false;
  if (normalized === 'image/svg+xml') return false;
  if (normalized.startsWith('image/')) return true;
  return false;
};

export const assertSafeJobPayload = (input: {
  sourceBucket: string;
  sourceKey: string;
  processToken: string;
  pipelineVersion: string;
}): void => {
  if (!input.sourceBucket || input.sourceBucket.length > 255) {
    throw new Error('Invalid image job payload');
  }
  if (!isSafeObjectKey(input.sourceKey)) {
    throw new Error('Invalid image job payload');
  }
  if (!/^[a-f0-9-]{8,64}$/i.test(input.processToken)) {
    throw new Error('Invalid image job payload');
  }
  if (!/^[a-z0-9._-]{1,32}$/i.test(input.pipelineVersion)) {
    throw new Error('Invalid image job payload');
  }
};

/** Reject SSRF-prone remote URLs. Processing prefers in-bucket object keys. */
export const isBlockedRemoteUrl = (value: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return true;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  if (parsed.username || parsed.password) return true;
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return true;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  return PRIVATE_OR_LINK_LOCAL.some((pattern) => pattern.test(hostname));
};

export const sourceCacheKey = (bucket: string, key: string): string => `${bucket}\0${key}`;

export const toSourceRef = (
  stored: { key: string; name: string } | string | null | undefined,
  fallbackBucket: string,
): { bucket: string; key: string } | null => {
  if (!stored) return null;
  if (typeof stored === 'string') {
    const key = normalizeStorageKey(stored);
    if (!key || !isSafeObjectKey(key)) return null;
    return { bucket: fallbackBucket, key };
  }
  const key = normalizeStorageKey(stored.key);
  if (!key || !isSafeObjectKey(key)) return null;
  const bucket = stored.name?.trim() || fallbackBucket;
  return { bucket, key };
};
