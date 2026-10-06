export const IMAGE_PIPELINE_JOB_NAMES = {
  PROCESS_SOURCE: 'process-source',
  RECONCILE_PENDING: 'reconcile-pending',
} as const;

export const IMAGE_PIPELINE_SKIP_FOLDERS = [
  'vendor-documents',
  'return-evidence',
  'support-attachments',
  'avatars',
  'videos',
  'blog-videos',
  'sitemaps',
] as const;

export const RASTER_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/x-ms-bmp',
] as const;

export const DERIVATIVE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const IMAGE_ASSET_CACHE_TTL_MS = 15_000;
