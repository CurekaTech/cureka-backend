import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';

/** Catalogue / WooCommerce id exposed as the BOB product `id`. Null means not representable. */
export function bobCatalogueProductId(
  product: Pick<ProductEntity, 'externalProductId'> | null | undefined,
): string | null {
  const value = product?.externalProductId?.trim() ?? '';
  if (!/^\d+$/.test(value)) return null;
  return Number.isSafeInteger(Number(value)) ? value : null;
}

/**
 * Numeric catalogue id for BOB order/fulfillment line items.
 * Returns null instead of throwing so WhatsApp notify never fails on a missing id.
 */
export function optionalBobCatalogueProductId(
  product: Pick<ProductEntity, 'externalProductId'> | null | undefined,
): number | null {
  const id = bobCatalogueProductId(product);
  return id ? Number(id) : null;
}

/** Numeric catalogue sheet id for BOB payloads, for example 407432. */
export function requireBobCatalogueProductId(
  product: Pick<ProductEntity, 'externalProductId'>,
): number {
  const id = bobCatalogueProductId(product);
  if (!id) {
    const raw = product.externalProductId?.trim() ?? '';
    if (!raw) {
      throw new Error('Product has no externalProductId for the BOB catalogue');
    }
    throw new Error(`Product catalogue id "${raw}" is not a number`);
  }
  return Number(id);
}

/** Numeric catalogue id for BOB category payloads. The category UUID stays internal. */
export function requireBobCatalogueCategoryId(
  category: Pick<CategoryEntity, 'hierarchyId'>,
): number {
  const numeric = category.hierarchyId;
  if (!Number.isSafeInteger(numeric)) {
    throw new Error('Category has no hierarchyId for the BOB catalogue');
  }
  return numeric;
}
