import { toProductPagePath } from '@modules/product/utils/bulk-upload-reference-lookup.util';
import {
  decodeProductUrlEncoding,
  sanitizeProductPagePath,
} from '@modules/product/utils/sanitize-product-url.util';

const expandTrailingSlashVariants = (path: string): string[] => {
  const withoutTrailingSlash = path.replace(/\/+$/, '') || path;
  const withTrailingSlash = withoutTrailingSlash.endsWith('/')
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/`;
  return [path, withTrailingSlash, withoutTrailingSlash];
};

/** Re-encode inch/degree marks the way legacy WordPress rows stored them. */
const toLegacyEncodedProductPagePath = (path: string): string =>
  path
    .replace(/[″‟＂]/g, '%e2%80%b3')
    .replace(/[˚°]/g, '%cb%9a');

/** Map cleaned tokens back to legacy encoded forms for pre-migration lookups. */
const toLegacyEncodedFromSanitizedPath = (path: string): string =>
  path.replace(/-inches/gi, '%e2%80%b3').replace(/-degree/gi, '%cb%9a');

/**
 * Build exact product_page_url values to try against product_variants.product_page_url.
 * Accepts full Cureka URLs, `/shop/...` paths, or `shop/...` without a leading slash.
 *
 * Includes decoded, legacy percent-encoded, and sanitized (`-inches` / `-degree`) variants
 * so dirty imported URLs and cleaned URLs both resolve during migration.
 */
export const buildProductPageUrlLookupCandidates = (raw: string): string[] => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return [];

  const decoded = decodeProductUrlEncoding(trimmed);

  const looksLikePagePath =
    /^https?:\/\//i.test(decoded) ||
    decoded.startsWith('/shop/') ||
    decoded.startsWith('shop/') ||
    decoded.includes('/');

  if (!looksLikePagePath) {
    return [];
  }

  const withOrigin =
    /^https?:\/\//i.test(decoded)
      ? decoded
      : `https://www.cureka.com${decoded.startsWith('/') ? decoded : `/${decoded}`}`;

  const normalized = toProductPagePath(withOrigin);
  if (!normalized) return [];

  const sanitized = sanitizeProductPagePath(normalized);
  const legacyEncoded = toLegacyEncodedProductPagePath(normalized);
  const legacyFromSanitized = toLegacyEncodedFromSanitizedPath(sanitized);

  const seeds = [
    normalized,
    sanitized,
    legacyEncoded,
    legacyFromSanitized,
    trimmed,
    decoded,
  ].filter(Boolean);

  return Array.from(
    new Set(seeds.flatMap((seed) => expandTrailingSlashVariants(toProductPagePath(seed) || seed))),
  ).filter(Boolean);
};
