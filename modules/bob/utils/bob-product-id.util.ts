import { ProductEntity } from '@modules/product/entities/product.entity';

/** Catalogue / WooCommerce id exposed as the BOB product `id`. Empty means not representable. */
export function bobCatalogueProductId(
  product: Pick<ProductEntity, 'externalProductId'>,
): string | null {
  const value = product.externalProductId?.trim() ?? '';
  return value || null;
}

export function requireBobCatalogueProductId(
  product: Pick<ProductEntity, 'externalProductId'>,
): string {
  const id = bobCatalogueProductId(product);
  if (!id) {
    throw new Error('Product has no externalProductId for the BOB catalogue');
  }
  return id;
}
