/** Legacy category listing prefix: /product-category/{l1}/{l2}/... */
export const PRODUCT_CATEGORY_PATH_PREFIX = '/product-category';

/** Legacy product detail prefix: /shop/{l1}/{l2}/.../{product-slug} */
export const SHOP_PRODUCT_PATH_PREFIX = '/shop';

export function buildCategorySlugPath(
  ...slugs: Array<string | null | undefined>
): string[] {
  return slugs
    .map((slug) => slug?.trim())
    .filter((slug): slug is string => Boolean(slug));
}

export function buildCategoryPermalink(slugPath: string[]): string {
  if (!slugPath.length) return PRODUCT_CATEGORY_PATH_PREFIX;
  return `${PRODUCT_CATEGORY_PATH_PREFIX}/${slugPath.join('/')}`;
}

export function buildProductPermalink(
  categorySlugPath: string[],
  productSlug: string,
): string {
  const slug = productSlug.trim();
  if (!categorySlugPath.length) {
    return `${SHOP_PRODUCT_PATH_PREFIX}/${slug}`;
  }
  return `${SHOP_PRODUCT_PATH_PREFIX}/${categorySlugPath.join('/')}/${slug}`;
}

export function buildProductCategorySlugPathFromRelations(entity: {
  category?: { slug?: string | null } | null;
  subCategory?: { slug?: string | null } | null;
  subSubCategory?: { slug?: string | null } | null;
  subSubSubCategory?: { slug?: string | null } | null;
}): string[] {
  return buildCategorySlugPath(
    entity.category?.slug,
    entity.subCategory?.slug,
    entity.subSubCategory?.slug,
    entity.subSubSubCategory?.slug,
  );
}
