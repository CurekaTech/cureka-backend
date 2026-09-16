import { ProductType } from '@modules/product/enums/product-type.enum';

/** Storefront brand slug for Combo packs — listing must follow bundle product type. */
export const COMBO_BRAND_SLUG = 'combo';

export const isComboBrandSlug = (slug?: string | null): boolean =>
  Boolean(slug?.trim()) && slug!.trim().toLowerCase() === COMBO_BRAND_SLUG;

/**
 * When the listing is scoped to a single Combo brand, force `productType=bundle`
 * so only real bundles appear (same rule as admin / public bundles).
 */
export const resolvePublicProductTypeForListing = (input: {
  productType?: ProductType;
  brandSlug?: string | null;
  brandSlugs?: Array<string | null | undefined>;
}): ProductType | undefined => {
  const singleSlug = input.brandSlug?.trim();
  if (singleSlug && isComboBrandSlug(singleSlug) && !singleSlug.includes(',')) {
    return ProductType.BUNDLE;
  }

  const slugs = (input.brandSlugs ?? [])
    .map((slug) => slug?.trim().toLowerCase())
    .filter((slug): slug is string => Boolean(slug));

  if (slugs.length === 1 && slugs[0] === COMBO_BRAND_SLUG) {
    return ProductType.BUNDLE;
  }

  return input.productType;
};
