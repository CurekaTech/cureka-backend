export type FbtVariantCategoryInfo = {
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  subSubCategoryId?: string | null;
  subSubCategoryName?: string | null;
  subSubSubCategoryId?: string | null;
  subSubSubCategoryName?: string | null;
};

/** Deepest assigned category name on the product — used for FBT rule matching. */
export const resolveFbtSourceCategoryName = (variant: FbtVariantCategoryInfo): string =>
  (
    variant.subSubSubCategoryName ??
    variant.subSubCategoryName ??
    variant.subCategoryName ??
    variant.categoryName ??
    ''
  )
    .toLowerCase()
    .trim();

/**
 * Deepest assigned category id — used for same-category FBT fallback so sibling
 * subcategories under a shared root (e.g. Skin Care vs Baby Care) are not mixed.
 */
export const resolveFbtFallbackCategoryId = (
  variant: FbtVariantCategoryInfo,
): string | null =>
  variant.subSubSubCategoryId ??
  variant.subSubCategoryId ??
  variant.subCategoryId ??
  variant.categoryId ??
  null;

export const resolveFbtFallbackCategoryIds = (
  variants: FbtVariantCategoryInfo[],
): string[] => [
  ...new Set(
    variants
      .map(resolveFbtFallbackCategoryId)
      .filter((id): id is string => Boolean(id)),
  ),
];
