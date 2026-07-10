import { IStorageFileReference } from '@packages/storage';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';

/** Resolves variant-first, then product-level primary image for order/cart display. */
export function resolvePrimaryProductImageRef(
  product: ProductEntity | undefined,
  variantId: string,
): IStorageFileReference | null {
  const media = (product?.media ?? []).filter(
    (item: ProductMediaEntity) =>
      item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON,
  );
  if (!media.length) {
    return null;
  }

  const variantMedia = media.filter((item) => item.variantId === variantId);
  const variantPrimary = variantMedia.find((item) => item.isPrimary) ?? variantMedia[0];
  if (variantPrimary?.url) {
    return variantPrimary.url;
  }

  const productMedia = media.filter((item) => !item.variantId);
  const productPrimary =
    productMedia.find((item) => item.isPrimary) ?? productMedia[0] ?? media[0];
  return productPrimary?.url ?? null;
}
