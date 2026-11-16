import { buildProductCategorySlugPathFromRelations } from '@modules/public/utils/category-permalink.util';
import { buildProductLocPath } from '@modules/sitemap/services/sitemap-url.builder';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { ProductType } from '../enums/product-type.enum';

const trimToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Column T — documented as products.single_product_url (legacy/parent).
 * Fall back to the variant copy only when the product-level field is empty.
 * Never copy product_page_url into this column.
 */
export const resolveExportedSingleProductUrl = (
  product: Pick<ProductEntity, 'singleProductUrl'>,
  variant: Pick<ProductVariantEntity, 'singleProductUrl'>,
): string | null =>
  trimToNull(product.singleProductUrl) ?? trimToNull(variant.singleProductUrl);

/**
 * Column U — live PDP URL for this row's variant.
 * Stored variant.product_page_url wins. Otherwise use the same fallback the
 * storefront/sitemap uses, without copying a sibling variant's URL.
 *
 * Variable products do not inherit the parent single_product_url: that is the
 * "every size got the parent's URL" export bug.
 */
export const resolveExportedProductPageUrl = (
  product: Pick<
    ProductEntity,
    'slug' | 'singleProductUrl' | 'productType' | 'category' | 'subCategory' | 'subSubCategory' | 'subSubSubCategory'
  >,
  variant: Pick<ProductVariantEntity, 'slug' | 'productPageUrl' | 'singleProductUrl'>,
): string | null => {
  const stored = trimToNull(variant.productPageUrl);
  if (stored) return stored;

  const isVariable = product.productType === ProductType.VARIABLE;
  return buildProductLocPath({
    slug: trimToNull(variant.slug) ?? trimToNull(product.slug),
    productPageUrl: null,
    singleProductUrl: isVariable
      ? trimToNull(variant.singleProductUrl)
      : trimToNull(variant.singleProductUrl) ?? trimToNull(product.singleProductUrl),
    categorySlugPath: buildProductCategorySlugPathFromRelations(product),
  });
};

export interface BulkImportVariantUrlFields {
  productPageUrl?: string;
  slug?: string;
}

/**
 * Sheet Product Page URL / Product URL Slug always win.
 * Legacy Product-ID lookup files may fill those fields only when creating a
 * new product. They must not overwrite an existing variant on re-import.
 */
export const resolveBulkImportVariantUrlFields = (input: {
  sheetProductPageUrl?: string | null;
  sheetSlug?: string | null;
  lookupProductPageUrl?: string | null;
  lookupSlug?: string | null;
  isExistingProduct: boolean;
}): BulkImportVariantUrlFields => {
  const sheetUrl = trimToNull(input.sheetProductPageUrl) ?? undefined;
  const sheetSlug = trimToNull(input.sheetSlug) ?? undefined;
  const lookupUrl = trimToNull(input.lookupProductPageUrl) ?? undefined;
  const lookupSlug = trimToNull(input.lookupSlug) ?? undefined;

  if (input.isExistingProduct) {
    return {
      ...(sheetUrl ? { productPageUrl: sheetUrl } : {}),
      ...(sheetSlug ? { slug: sheetSlug } : {}),
    };
  }

  const productPageUrl = sheetUrl ?? lookupUrl;
  const slug = sheetSlug ?? lookupSlug;
  return {
    ...(productPageUrl ? { productPageUrl } : {}),
    ...(slug ? { slug } : {}),
  };
};
