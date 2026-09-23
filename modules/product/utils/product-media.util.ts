import { CreateProductDto } from '../dto/product.dto';
import { CreateProductMediaDto, CreateVariantDto, VariantImageDto } from '../dto/variant.dto';
import { ProductMediaType } from '../enums/product-media-type.enum';
import {
  IStorageFileReference,
  isStorageFileReference,
  normalizeStorageKey,
} from '@packages/storage';

export interface ProductUploadedFiles {
  productImages: string[];
  variantImages: Record<string, string[]>;
  sizeChart?: string;
  bundleIcon?: string;
}

type ImageMeta = {
  url?: string | IStorageFileReference | { key?: string | null; name?: string; url?: string };
  isPrimary?: boolean;
  sortOrder?: number;
};

/** Reduce upload keys, `{ key, name }`, or public/signed URLs to a storage key. */
const normalizeImageUrl = (
  url: string | IStorageFileReference | { key?: string | null; name?: string; url?: string } | null | undefined,
): string | undefined => {
  if (url == null || url === '') return undefined;
  if (typeof url === 'string') {
    return normalizeStorageKey(url) ?? undefined;
  }
  if (typeof url !== 'object') return undefined;

  if (isStorageFileReference(url)) {
    return normalizeStorageKey(url.key) ?? undefined;
  }

  // Enriched / partial admin shapes: { key }, { key, name, url }, { url: public media URL }
  const raw =
    typeof url.key === 'string' && url.key.trim()
      ? url.key.trim()
      : typeof url.url === 'string' && url.url.trim()
        ? url.url.trim()
        : '';
  return raw ? normalizeStorageKey(raw) ?? undefined : undefined;
};

const hasStoredImageUrl = (url: string | IStorageFileReference | undefined): boolean =>
  normalizeImageUrl(url) !== undefined;

const isLegacyManualProductKey = (key: string): boolean =>
  /^(images|videos)\/products\//i.test(key);

/** Keep existing image URLs from JSON; assign new uploads to slots without a url. */
const mergeImageMetaWithUploads = <T extends ImageMeta>(
  meta: T[] | undefined,
  uploadedPaths: string[],
): Array<T & { url: string }> => {
  const sorted = [...(meta ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const pathQueue = [...uploadedPaths];
  const merged: Array<T & { url: string }> = [];

  for (const item of sorted) {
    const existingUrl = normalizeImageUrl(item.url);
    if (existingUrl && !isLegacyManualProductKey(existingUrl)) {
      merged.push({ ...item, url: existingUrl });
      continue;
    }

    const path = pathQueue.shift();
    if (path) {
      merged.push({ ...item, url: path });
      continue;
    }

    // No uploaded file left; keep only non-legacy keys.
    if (existingUrl && !isLegacyManualProductKey(existingUrl)) {
      merged.push({ ...item, url: existingUrl });
    }
  }

  for (const path of pathQueue) {
    merged.push({
      isPrimary: false,
      sortOrder: merged.length,
      url: path,
    } as T & { url: string });
  }

  return merged;
};

const toMediaItem = (
  url: string,
  options: { variantSku?: string; isPrimary?: boolean; sortOrder?: number },
): CreateProductMediaDto => ({
  type: ProductMediaType.IMAGE,
  url,
  variantSku: options.variantSku,
  isPrimary: options.isPrimary ?? false,
  sortOrder: options.sortOrder ?? 0,
});

/** Ensure one primary per scope (product-level or per variantSku). */
const normalizePrimaryFlags = (media: CreateProductMediaDto[]): CreateProductMediaDto[] => {
  const byScope = new Map<string, CreateProductMediaDto[]>();

  for (const item of media) {
    const key = item.variantSku ?? '';
    const list = byScope.get(key) ?? [];
    list.push(item);
    byScope.set(key, list);
  }

  const result: CreateProductMediaDto[] = [];

  for (const items of byScope.values()) {
    const sorted = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    let primaryAssigned = false;

    for (const item of sorted) {
      let isPrimary = Boolean(item.isPrimary);
      if (isPrimary) {
        if (primaryAssigned) {
          isPrimary = false;
        } else {
          primaryAssigned = true;
        }
      }
      result.push({ ...item, isPrimary });
    }

    if (!primaryAssigned && sorted.length) {
      const firstUrl = sorted[0]!.url;
      const firstSku = sorted[0]!.variantSku ?? '';
      const idx = result.findIndex(
        (item) => item.url === firstUrl && (item.variantSku ?? '') === firstSku,
      );
      if (idx >= 0) {
        result[idx] = { ...result[idx]!, isPrimary: true };
      }
    }
  }

  return result;
};

const variantImagesToMedia = (variant: CreateVariantDto): CreateProductMediaDto[] => {
  if (variant.images?.length) {
    return variant.images
      .map((image) => ({
        ...image,
        normalizedUrl: normalizeImageUrl(image.url),
      }))
      .filter(
        (image): image is VariantImageDto & { normalizedUrl: string } => {
          const normalizedUrl = image.normalizedUrl;
          return (
            typeof normalizedUrl === 'string' &&
            normalizedUrl.length > 0 &&
            !isLegacyManualProductKey(normalizedUrl)
          );
        },
      )
      .map((image, index) => {
        const normalizedUrl = image.normalizedUrl!;
        return toMediaItem(normalizedUrl, {
          variantSku: variant.sku,
          isPrimary: image.isPrimary,
          sortOrder: image.sortOrder ?? index,
        });
      });
  }

  return (variant.imageUrls ?? []).map((url, index) =>
    toMediaItem(url, {
      variantSku: variant.sku,
      isPrimary: index === 0,
      sortOrder: index,
    }),
  );
};

const toVariantImagesFromMerged = (
  merged: Array<ImageMeta & { url: string }>,
): VariantImageDto[] =>
  merged.map((item) => ({
    url: item.url,
    sortOrder: item.sortOrder,
    isPrimary: item.isPrimary,
  }));

/**
 * Apply files uploaded in the same multipart request onto the product payload.
 *
 * Admin simple-product UI often uploads via field `images` while editing
 * `variants[0].images` slots (url omitted for new files). Those uploads must
 * fill both `media[]` and the single variant's images, otherwise GET only
 * returns variant-scoped rows and the new image appears "not saved".
 */
export const mergeUploadedProductMedia = (
  dto: CreateProductDto,
  uploads: ProductUploadedFiles,
): CreateProductDto => {
  const next: CreateProductDto = {
    ...dto,
    variants: dto.variants?.map((variant) => ({ ...variant })),
  };

  if (uploads.productImages.length) {
    const merged = mergeImageMetaWithUploads(dto.media, uploads.productImages);
    next.media = merged.map((item, index) => ({
      type: (item as CreateProductMediaDto).type ?? ProductMediaType.IMAGE,
      url: item.url,
      sortOrder: item.sortOrder ?? index,
      isPrimary: item.isPrimary ?? index === 0,
      variantSku: (item as CreateProductMediaDto).variantSku,
    }));
  }

  if (next.variants?.length) {
    next.variants = next.variants.map((variant) => {
      const dedicatedPaths = uploads.variantImages[variant.sku];
      if (dedicatedPaths?.length) {
        return {
          ...variant,
          images: toVariantImagesFromMerged(
            mergeImageMetaWithUploads(variant.images, dedicatedPaths),
          ),
        };
      }

      // Single-variant / simple: reuse product `images` uploads for empty slots.
      if (
        uploads.productImages.length &&
        next.variants?.length === 1 &&
        (variant.images?.length || dto.media?.length)
      ) {
        return {
          ...variant,
          images: toVariantImagesFromMerged(
            mergeImageMetaWithUploads(variant.images ?? dto.media, uploads.productImages),
          ),
        };
      }

      return variant;
    });
  }

  return next;
};

/** Prefer variant-scoped rows when the same storage key appears twice. */
const dedupeMediaByUrl = (media: CreateProductMediaDto[]): CreateProductMediaDto[] => {
  const ranked = [...media].sort((left, right) => {
    const leftRank = left.variantSku ? 0 : 1;
    const rightRank = right.variantSku ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  });

  const seen = new Set<string>();
  const unique: CreateProductMediaDto[] = [];
  for (const item of ranked) {
    const key = normalizeImageUrl(item.url) ?? '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
};

/** Merge product-level media and variant images into rows for product_media. */
export const collectProductMedia = (dto: CreateProductDto): CreateProductMediaDto[] => {
  const singleVariantSku =
    dto.variants?.length === 1 && dto.variants[0]?.sku?.trim()
      ? dto.variants[0]!.sku.trim()
      : undefined;

  const fromMedia = (dto.media ?? [])
    .map((item) => {
      const url = normalizeImageUrl(item.url as string | IStorageFileReference | undefined);
      if (!url || isLegacyManualProductKey(url)) return null;
      const withSku: CreateProductMediaDto = {
        ...item,
        url,
        ...(item.type === ProductMediaType.COMMON ? { variantSku: undefined } : {}),
      };
      // Simple products: attach product-level media to the only variant so admin
      // GET variants[].images (variantId-scoped) includes multipart `images` uploads.
      if (
        singleVariantSku &&
        withSku.type !== ProductMediaType.COMMON &&
        !withSku.variantSku
      ) {
        withSku.variantSku = singleVariantSku;
      }
      return withSku;
    })
    .filter((item): item is CreateProductMediaDto => item != null);
  const fromVariants = (dto.variants ?? []).flatMap(variantImagesToMedia);

  return normalizePrimaryFlags(dedupeMediaByUrl([...fromMedia, ...fromVariants]));
};

/** True when the payload explicitly includes media fields (including empty arrays = clear/replace). */
export const hasVariantMediaInPayload = (variants: CreateVariantDto[] | undefined): boolean =>
  (variants?.some(
    (variant) => variant.images !== undefined || variant.imageUrls !== undefined,
  ) ?? false);
