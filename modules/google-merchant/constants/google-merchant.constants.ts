export const GOOGLE_MERCHANT_CONTENT_TYPE = 'application/xml; charset=utf-8';
export const GOOGLE_MERCHANT_CACHE_CONTROL = 'public, max-age=300';
export const PUBLIC_MEDIA_CACHE_CONTROL = 'public, max-age=86400, immutable';

/** Relative API path used in feed image_link (storefront proxies this). */
export const PUBLIC_MEDIA_API_PREFIX = '/api/v1/public/media';

export const GOOGLE_MERCHANT_FEED_BATCH_SIZE = 500;

/** Allowed storage key prefixes for the public media proxy. */
export const PUBLIC_MEDIA_ALLOWED_PREFIXES = [
  'images/',
  'videos/',
  'blog-images/',
  'icons/',
  'banners/',
  'logos/',
] as const;
