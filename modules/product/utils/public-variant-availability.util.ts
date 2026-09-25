import {
  isStockInventoryManagementEnabled,
  isVariantInStock,
} from '../../../packages/common/src/stock-validation.config';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantStatus } from '../enums/variant-status.enum';

type SellableVariant = Pick<ProductVariantEntity, 'stock' | 'outOfStock' | 'inCurekaInventory'>;

/**
 * Storefront sellable variant: not admin-marked OOS, and stock > 0 when Cureka-managed.
 * Same rule as Typesense `inStock` and public PDP availability.
 */
export const isPublicVariantSellable = (variant: SellableVariant): boolean =>
  !(variant.outOfStock ?? false) && isVariantInStock(variant.stock, variant);

export const hasSellablePublicVariant = (product: ProductEntity): boolean =>
  (product.variants ?? []).some(
    (variant) =>
      !variant.deletedAt &&
      variant.status === VariantStatus.ACTIVE &&
      isPublicVariantSellable(variant),
  );

/**
 * Raw SQL predicate for an active variant row alias.
 * Mirrors `isPublicVariantSellable` so list/search ORDER BY matches the API flag.
 */
export const sellableVariantAvailabilitySql = (alias: string): string => {
  const stockGate = isStockInventoryManagementEnabled()
    ? ` AND (COALESCE(${alias}.in_cureka_inventory, false) = false OR COALESCE(${alias}.stock, 0) > 0)`
    : '';
  return `COALESCE(${alias}.out_of_stock, false) = false${stockGate}`;
};
