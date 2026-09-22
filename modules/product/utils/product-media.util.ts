import { CreateProductDto } from '../dto/product.dto';
import { CreateProductMediaDto, CreateVariantDto, VariantImageDto } from '../dto/variant.dto';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { IStorageFileReference, isStorageFileReference } from '@packages/storage';

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

const normalizeImageUrl = (
  url: string | IStorageFileReference | { key?: string | null; name?: string; url?: string } | null | undefined,
): string | undefined => {
  if (url == null || url === '') return undefined;
  if (typeof url === 'string') {
    const trimmed = url.trim();
    return trimmed || undefined;
  }
  if (typeof url !== 'object') return undefined;

  if (isStorageFileReference(url)) {
    const key = url.key?.trim();
    return key || undefined;
  }

  // Enriched / partial admin shapes: { key }, { key, name, url }, { url: "images/…" }
  const key =
    typeof url.key === 'string' && url.key.trim()
      ? url.key.trim()
      : typeof url.url === 'string' && url.url.trim()
        ? url.url.trim()
        : '';
  return key || undefined;
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

/** Apply files uploaded in the same multipart request onto the product payload. */
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

  if (next.variants?.length && Object.keys(uploads.variantImages).length) {
    next.variants = next.variants.map((variant) => {
      const paths = uploads.variantImages[variant.sku];
      if (!paths?.length) return variant;

      const images: VariantImageDto[] = mergeImageMetaWithUploads(variant.images, paths).map(
        (item) => ({
          url: item.url,
          sortOrder: item.sortOrder,
          isPrimary: item.isPrimary,
        }),
      );

      return { ...variant, images };
    });
  }

  return next;
};

/** Merge product-level media and variant images into rows for product_media. */
export const collectProductMedia = (dto: CreateProductDto): CreateProductMediaDto[] => {
  const fromMedia = (dto.media ?? [])
    .map((item) => {
      const url = normalizeImageUrl(item.url as string | IStorageFileReference | undefined);
      if (!url || isLegacyManualProductKey(url)) return null;
      return {
        ...item,
        url,
        ...(item.type === ProductMediaType.COMMON ? { variantSku: undefined } : {}),
      } as CreateProductMediaDto;
    })
    .filter((item): item is CreateProductMediaDto => item != null);
  const fromVariants = (dto.variants ?? []).flatMap(variantImagesToMedia);

  return normalizePrimaryFlags([...fromMedia, ...fromVariants]);
};

/** True when the payload explicitly includes media fields (including empty arrays = clear/replace). */
export const hasVariantMediaInPayload = (variants: CreateVariantDto[] | undefined): boolean =>
  (variants?.some(
    (variant) => variant.images !== undefined || variant.imageUrls !== undefined,
  ) ?? false);
