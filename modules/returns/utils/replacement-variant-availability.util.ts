import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { isPublicVariantSellable } from '@modules/product/utils/public-variant-availability.util';

/**
 * Catalogue variants are not a separate "published" status. A public variant
 * is an active variant of a published product, and it is in stock under the
 * same rule as the storefront (`isPublicVariantSellable`, which honors
 * `STOCK_INVENTORY_MANAGEMENT_ENABLED` and `inCurekaInventory`).
 */
export type ReplacementCatalogueVariant = {
  status: VariantStatus | string;
  outOfStock?: boolean | null;
  stock?: number | null;
  inCurekaInventory?: boolean | null;
  product?: {
    status: ProductStatus | string;
    productType: ProductType | string;
  } | null;
};

export type ReplacementVariantAvailability = 'NOT_FOUND' | 'UNAVAILABLE' | 'OK';

export const assessReplacementVariant = (
  variant: ReplacementCatalogueVariant | null | undefined,
  options: { requireBundle: boolean },
): ReplacementVariantAvailability => {
  if (!variant?.product) {
    return 'NOT_FOUND';
  }
  const published = variant.product.status === ProductStatus.PUBLISHED;
  const active = variant.status === VariantStatus.ACTIVE;
  const inStock = isPublicVariantSellable({
    outOfStock: variant.outOfStock ?? false,
    stock: variant.stock ?? 0,
    inCurekaInventory: variant.inCurekaInventory ?? false,
  });
  const bundleOk = !options.requireBundle || variant.product.productType === ProductType.BUNDLE;
  if (!published || !active || !inStock || !bundleOk) {
    return 'UNAVAILABLE';
  }
  return 'OK';
};
