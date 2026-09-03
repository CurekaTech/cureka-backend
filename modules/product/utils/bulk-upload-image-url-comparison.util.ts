import { IStorageFileReference } from '@packages/storage';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { normalizeLookupProductId, normalizeLookupSku } from './bulk-upload-reference-lookup.util';

export const IMAGE_URL_COMPARISON_HEADERS = [
  'Product Id',
  'SKU',
  'WP Image URLs',
  'Current Image URLs',
] as const;

export const IMAGE_URL_COMPARISON_FILE_NAME = 'product-image-url-comparison.xlsx';

export type ImageUrlComparisonRow = {
  productId: string;
  sku: string;
  wpImageUrls: string;
  currentImageUrls: string;
};

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

export const extractMediaLocator = (
  url: string | (IStorageFileReference & { url?: string }) | null | undefined,
): MediaLocator | null => {
  if (!url) return null;

  if (typeof url === 'string') {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (isAbsoluteHttpUrl(trimmed)) {
      return { type: 'absolute', url: trimmed };
    }
    return { type: 'storage', ref: trimmed };
  }

  if (typeof url.url === 'string' && isAbsoluteHttpUrl(url.url)) {
    return { type: 'absolute', url: url.url };
  }
  if (typeof url.key === 'string' && isAbsoluteHttpUrl(url.key)) {
    return { type: 'absolute', url: url.key };
  }
  if (typeof url.key === 'string' && url.key.trim()) {
    return { type: 'storage', ref: url };
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
