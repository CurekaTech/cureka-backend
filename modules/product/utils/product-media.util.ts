import { CreateProductDto } from '../dto/product.dto';
import { CreateProductMediaDto, CreateVariantDto } from '../dto/variant.dto';
import { ProductMediaType } from '../enums/product-media-type.enum';

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

/** Merge explicit product media with variant-level imageUrls (documented but easy to miss). */
export const collectProductMedia = (dto: CreateProductDto): CreateProductMediaDto[] => {
  const media = [...(dto.media ?? [])];
  const hasPrimary = media.some((item) => item.isPrimary);
  let sortOrder =
    media.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), -1) + 1;

  for (const variant of dto.variants ?? []) {
    if (!variant.imageUrls?.length) continue;
    const variantMedia = variantImageUrlsToMedia(variant, sortOrder, !hasPrimary && media.length === 0);
    if (!hasPrimary && variantMedia.length) {
      variantMedia[0]!.isPrimary = true;
    }
    media.push(...variantMedia);
    sortOrder += variantMedia.length;
  }

  return media;
};
