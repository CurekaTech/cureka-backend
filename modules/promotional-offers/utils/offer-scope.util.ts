const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OfferScope = {
  brandIds: string[];
  categoryIds: string[];
};

export type OfferScopeProduct = {
  brandId?: string | null;
  categoryId?: string | null;
  subCategoryId?: string | null;
  subSubCategoryId?: string | null;
  subSubSubCategoryId?: string | null;
};

export function readIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.map((item) => String(item).trim()).filter((item) => UUID.test(item));
  return [...new Set(ids)];
}

export function assertIdList(value: unknown, label: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be a list of ids`);
  const ids = value.map((item) => String(item).trim()).filter(Boolean);
  if (ids.some((item) => !UUID.test(item))) throw new Error(`${label} contains an invalid id`);
  return [...new Set(ids)];
}

/** Brand ids and category ids stored on `promotional_offers.config`. Missing keys mean no extra scope. */
export function readOfferScope(config: Record<string, unknown> | null | undefined): OfferScope {
  return {
    brandIds: readIdList(config?.brandIds),
    categoryIds: readIdList(config?.categoryIds),
  };
}

/**
 * OR within brands and OR within the stored category path
 * (category, subcategory, sub-subcategory, sub-sub-subcategory).
 * An empty scope matches nothing, so existing variant-only offers stay unchanged.
 */
export function lineMatchesOfferScope(product: OfferScopeProduct, scope: OfferScope): boolean {
  if (product.brandId && scope.brandIds.includes(product.brandId)) return true;
  const path = [
    product.categoryId,
    product.subCategoryId,
    product.subSubCategoryId,
    product.subSubSubCategoryId,
  ];
  return path.some((id) => Boolean(id) && scope.categoryIds.includes(id as string));
}
