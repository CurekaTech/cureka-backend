import { IStorageFileReference, normalizeStorageKey } from '@packages/storage';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { normalizeLookupProductId, normalizeLookupSku } from './bulk-upload-reference-lookup.util';

export const IMAGE_URL_COMPARISON_HEADERS = [
  'Product Id',
  'SKU',
  'WP Image URLs',
  'Current Image URL 1',
] as const;

export const IMAGE_URL_COMPARISON_FILE_NAME = 'product-image-url-comparison.xlsx';

export type ImageUrlComparisonRow = {
  productId: string;
  sku: string;
  wpImageUrls: string;
  currentImageUrls: string[];
};

export const currentImageColumnHeader = (index: number): string =>
  `Current Image URL ${index}`;

/** Excel hyperlinks break GCS signed URLs if more than one is packed into a cell. */
export const MAX_EXCEL_HYPERLINK_LENGTH = 2079;

export const isUsableExcelHyperlink = (url: string): boolean =>
  url.length > 0 && url.length <= MAX_EXCEL_HYPERLINK_LENGTH;

export const joinImageUrls = (urls: string[]): string =>
  urls
    .map((url) => url.trim())
    .filter(Boolean)
    .join(',');

export const resolveWpImageUrls = (
  sku: string | null | undefined,
  externalProductId: string | null | undefined,
  bySku: Map<string, string[]>,
  byProductId: Map<string, string[]>,
): string => {
  const skuKey = normalizeLookupSku(sku);
  if (skuKey) {
    const bySkuUrls = bySku.get(skuKey);
    if (bySkuUrls?.length) {
      return joinImageUrls(bySkuUrls);
    }
  }

  const productIdKey = normalizeLookupProductId(externalProductId);
  if (productIdKey) {
    const byIdUrls = byProductId.get(productIdKey);
    if (byIdUrls?.length) {
      return joinImageUrls(byIdUrls);
    }
  }

  return '';
};

export type MediaLocator =
  | { type: 'absolute'; url: string }
  | { type: 'storage'; ref: string | IStorageFileReference };

const isAbsoluteHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim());

const isReSignableStorageUrl = (value: string): boolean =>
  /storage\.googleapis\.com/i.test(value) ||
  value.includes('/files/') ||
  value.includes('/uploads/');

const locatorFromString = (value: string): MediaLocator | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const storageKey = normalizeStorageKey(trimmed);
  if (storageKey && (!isAbsoluteHttpUrl(trimmed) || isReSignableStorageUrl(trimmed))) {
    return { type: 'storage', ref: storageKey };
  }
  if (isAbsoluteHttpUrl(trimmed)) {
    return { type: 'absolute', url: trimmed };
  }
  return { type: 'storage', ref: trimmed };
};

export const extractMediaLocator = (
  url: string | (IStorageFileReference & { url?: string }) | null | undefined,
): MediaLocator | null => {
  if (!url) return null;

  if (typeof url === 'string') {
    return locatorFromString(url);
  }

  // Prefer the stored object key so a cached/expired signed `url` is not exported.
  if (typeof url.key === 'string' && url.key.trim()) {
    const fromKey = locatorFromString(url.key);
    if (fromKey) return fromKey;
  }
  if (typeof url.url === 'string' && url.url.trim()) {
    return locatorFromString(url.url);
  }
  return null;
};

const isImageLikeMedia = (item: ProductMediaEntity): boolean =>
  item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON;

const sortMedia = (left: ProductMediaEntity, right: ProductMediaEntity): number => {
  if (Boolean(right.isPrimary) !== Boolean(left.isPrimary)) {
    return left.isPrimary ? -1 : 1;
  }
  return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
};

/**
 * Variant-specific images first, then shared/product-level gallery images.
 * Dedupes by storage key / absolute URL.
 */
export const collectVariantMedia = (
  variantId: string,
  productId: string,
  mediaByProductId: Map<string, ProductMediaEntity[]>,
): ProductMediaEntity[] => {
  const productMedia = (mediaByProductId.get(productId) ?? []).filter(isImageLikeMedia);
  const variantMedia = productMedia
    .filter((item) => item.variantId === variantId)
    .sort(sortMedia);
  const sharedMedia = productMedia
    .filter((item) => !item.variantId || item.type === ProductMediaType.COMMON)
    .filter((item) => item.variantId !== variantId)
    .sort(sortMedia);

  const seen = new Set<string>();
  const ordered: ProductMediaEntity[] = [];
  for (const item of [...variantMedia, ...sharedMedia]) {
    const locator = extractMediaLocator(item.url);
    const dedupeKey =
      locator?.type === 'absolute'
        ? locator.url
        : locator?.type === 'storage'
          ? typeof locator.ref === 'string'
            ? locator.ref
            : locator.ref.key
          : item.id;
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    ordered.push(item);
  }
  return ordered;
};
