import { ProductEntity } from '@modules/product/entities/product.entity';

/** Catalogue / WooCommerce id exposed as the BOB product `id`. Empty means not representable. */
export function bobCatalogueProductId(
  product: Pick<ProductEntity, 'externalProductId'>,
): string | null {
  const value = product.externalProductId?.trim() ?? '';
  return value || null;
}

/** Numeric catalogue sheet id for BOB payloads, for example 407432. */
export function requireBobCatalogueProductId(
  product: Pick<ProductEntity, 'externalProductId'>,
): number {
  const id = bobCatalogueProductId(product);
  if (!id) {
    throw new Error('Product has no externalProductId for the BOB catalogue');
  }
  if (!/^\d+$/.test(id)) {
    throw new Error(`Product catalogue id "${id}" is not a number`);
  }
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error(`Product catalogue id "${id}" is not a number`);
  }
  return numeric;
}
