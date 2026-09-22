/** Relative API path used by storefront proxy and Merchant image_link. */
export const PUBLIC_MEDIA_API_PREFIX = '/api/v1/public/media';

/** Cache merchandising masters at the proxy/CDN. GCS objects stay private. */
export const PUBLIC_MEDIA_CACHE_CONTROL = 'public, max-age=86400';

/** Versioned WebP derivatives never change at a given key. */
export const PUBLIC_MEDIA_DERIVATIVE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Public merchandising prefixes streamed by GET /api/v1/public/media/*.
 * Do not add private folders (avatars, prescriptions, return evidence, vendor docs).
 */
export const PUBLIC_MEDIA_ALLOWED_PREFIXES = [
  'images/',
  'videos/',
  'blog-images/',
  'icons/',
  'banners/',
  'logos/',
  'gallery/',
  'derivatives/',
] as const;

export const PUBLIC_MEDIA_DENIED_PREFIXES = [
  'avatars/',
  'return-evidence/',
  'vendor-documents/',
  'support-attachments/',
  'sitemaps/',
  'blog-videos/',
  'bulk-uploads/',
  'bulk-price-updates/',
  'cod-blocklist-bulk-uploads/',
] as const;

/** Strict object-key normalizer for user-supplied media paths (no URL parsing). */
export const normalizePublicMediaKey = (key: string | null | undefined): string | null => {
  if (!key?.trim()) return null;
  const trimmed = key.trim();
  if (/^https?:\/\//i.test(trimmed)) return null;
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!normalized || normalized.includes('..')) return null;
  return normalized;
};

export const isDeniedPublicMediaKey = (key: string): boolean =>
  PUBLIC_MEDIA_DENIED_PREFIXES.some((prefix) => key.startsWith(prefix));

export const isAllowedPublicMediaKey = (key: string): boolean => {
  if (!key || isDeniedPublicMediaKey(key)) return false;
  return PUBLIC_MEDIA_ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
};

export const isDerivativePublicMediaKey = (key: string): boolean => key.startsWith('derivatives/');

export const cacheControlForPublicMediaKey = (key: string): string =>
  isDerivativePublicMediaKey(key)
    ? PUBLIC_MEDIA_DERIVATIVE_CACHE_CONTROL
    : PUBLIC_MEDIA_CACHE_CONTROL;

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
  return `${origin}${PUBLIC_MEDIA_API_PREFIX}/${encodedPath}`;
};

export const publicMediaFilename = (key: string): string => {
  const base = key.split('/').pop() ?? 'file';
  return base.replace(/["\\\r\n]/g, '_');
};
