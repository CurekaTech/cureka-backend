import { CreateProductDto } from '../dto/product.dto';
import { CreateProductMediaDto, CreateVariantDto } from '../dto/variant.dto';
import { ProductMediaType } from '../enums/product-media-type.enum';

export interface ProductUploadedFiles {
  productImages: string[];
  variantImages: Record<string, string[]>;
}

const variantImageUrlsToMedia = (
  variant: CreateVariantDto,
  startSortOrder: number,
  markPrimary: boolean,
): CreateProductMediaDto[] =>
  (variant.imageUrls ?? []).map((url, index) => ({
    type: ProductMediaType.IMAGE,
    url,
    sortOrder: startSortOrder + index,
    isPrimary: markPrimary && index === 0,
    variantSku: variant.sku,
  }));

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
      return { ...variant, imageUrls: paths };
    });
  }

  return next;
};

/** Merge explicit product media with variant-level imageUrls. */
export const collectProductMedia = (dto: CreateProductDto): CreateProductMediaDto[] => {
  const media = (dto.media ?? []).filter((item) => item.url);
  const hasPrimary = media.some((item) => item.isPrimary);
  let sortOrder = media.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), -1) + 1;

  for (const variant of dto.variants ?? []) {
    if (!variant.imageUrls?.length) continue;
    const variantMedia = variantImageUrlsToMedia(
      variant,
      sortOrder,
      !hasPrimary && media.length === 0,
    );
    if (!hasPrimary && variantMedia.length) {
      variantMedia[0]!.isPrimary = true;
    }
    media.push(...variantMedia);
    sortOrder += variantMedia.length;
  }

  return media;
};
