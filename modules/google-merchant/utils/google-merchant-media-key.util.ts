import { PUBLIC_MEDIA_ALLOWED_PREFIXES } from '../constants/google-merchant.constants';

export const normalizeStorageKey = (key: string | null | undefined): string | null => {
  if (!key?.trim()) return null;
  const normalized = key
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
  if (!normalized || normalized.includes('..')) return null;
  return normalized;
};

export const isAllowedPublicMediaKey = (key: string): boolean =>
  PUBLIC_MEDIA_ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));

export const guessMimeFromKey = (key: string): string => {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
};

export const buildPublicMediaAbsoluteUrl = (baseUrl: string, storageKey: string): string => {
  const origin = baseUrl.replace(/\/+$/, '');
  const encodedPath = storageKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${origin}/api/v1/public/media/${encodedPath}`;
};
