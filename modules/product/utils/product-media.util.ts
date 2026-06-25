import { CreateProductDto } from '../dto/product.dto';
import { CreateProductMediaDto, CreateVariantDto } from '../dto/variant.dto';
import { ProductMediaType } from '../enums/product-media-type.enum';

export interface ProductUploadedFiles {
  productImages: string[];
  variantImages: Record<string, string[]>;
  sizeChart?: string;
}

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
      .filter((image) => image.url)
      .map((image, index) =>
        toMediaItem(image.url!, {
          variantSku: variant.sku,
          isPrimary: image.isPrimary,
          sortOrder: image.sortOrder ?? index,
        }),
      );
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
    const mediaMeta = dto.media ?? [];
    next.media = uploads.productImages.map((path, index) => {
      const meta = mediaMeta[index];
      return {
        type: meta?.type ?? ProductMediaType.IMAGE,
        url: path,
        sortOrder: meta?.sortOrder ?? index,
        isPrimary: meta?.isPrimary ?? index === 0,
        variantSku: meta?.variantSku,
      };
    });
  }

  if (next.variants?.length && Object.keys(uploads.variantImages).length) {
    next.variants = next.variants.map((variant) => {
      const paths = uploads.variantImages[variant.sku];
      if (!paths?.length) return variant;

      const meta = variant.images ?? [];
      const images = paths.map((path, index) => ({
        url: path,
        sortOrder: meta[index]?.sortOrder ?? index,
        isPrimary: meta[index]?.isPrimary ?? index === 0,
      }));

      return { ...variant, images };
    });
  }

  return next;
};

/** Merge product-level media and variant images into rows for product_media. */
export const collectProductMedia = (dto: CreateProductDto): CreateProductMediaDto[] => {
  const fromMedia = (dto.media ?? []).filter((item) => item.url);
  const fromVariants = (dto.variants ?? []).flatMap(variantImagesToMedia);

  return normalizePrimaryFlags([...fromMedia, ...fromVariants]);
};

export const hasVariantMediaInPayload = (variants: CreateVariantDto[] | undefined): boolean =>
  (variants?.some(
    (variant) => (variant.images?.length ?? 0) > 0 || (variant.imageUrls?.length ?? 0) > 0,
  ) ?? false);
