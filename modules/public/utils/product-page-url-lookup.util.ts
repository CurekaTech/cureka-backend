import { toProductPagePath } from '@modules/product/utils/bulk-upload-reference-lookup.util';

/**
 * Build exact product_page_url values to try against product_variants.product_page_url.
 * Accepts full Cureka URLs, `/shop/...` paths, or `shop/...` without a leading slash.
 */
export const buildProductPageUrlLookupCandidates = (raw: string): string[] => {
  const trimmed = decodeURIComponent(String(raw ?? '').trim());
  if (!trimmed) return [];

  const looksLikePagePath =
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('/shop/') ||
    trimmed.startsWith('shop/') ||
    trimmed.includes('/');

  if (!looksLikePagePath) {
    return [];
  }

  const withOrigin =
    /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://www.cureka.com${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;

  const normalized = toProductPagePath(withOrigin);
  if (!normalized) return [];

  const withoutTrailingSlash = normalized.replace(/\/+$/, '') || normalized;
  const withTrailingSlash = withoutTrailingSlash.endsWith('/')
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/`;

  return Array.from(new Set([normalized, withTrailingSlash, withoutTrailingSlash]));
};
