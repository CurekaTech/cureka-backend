import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';

/**
 * Shared definition of an indexable catalog product for listing sitemaps.
 * Matches product-sitemap eligibility: published, not soft-deleted, ≥1 active variant.
 * Do not change product sitemap URL generation when editing these fragments.
 */
export const SITEMAP_INDEXABLE_PRODUCT_STATUS = ProductStatus.PUBLISHED;
export const SITEMAP_INDEXABLE_VARIANT_STATUS = VariantStatus.ACTIVE;

/** Inner predicates for alias `p` (products). */
export const sitemapIndexableProductPredicates = (productAlias = 'p'): string => `
  ${productAlias}.deleted_at IS NULL
  AND ${productAlias}.status = :sitemapProductStatus
  AND EXISTS (
    SELECT 1 FROM product_variants pv
    WHERE pv.product_id = ${productAlias}.id
      AND pv.deleted_at IS NULL
      AND pv.status = :sitemapVariantStatus
  )
`;

/**
 * Category listing has content when ≥1 indexable product is assigned to this category
 * via primary hierarchy columns or product_category_hierarchies (same rule as public listing).
 */
export const sitemapCategoryHasIndexableProductSql = (categoryAlias = 'category'): string => `
  EXISTS (
    SELECT 1 FROM products p
    WHERE ${sitemapIndexableProductPredicates('p')}
      AND (
        p.category_id = ${categoryAlias}.id
        OR p.sub_category_id = ${categoryAlias}.id
        OR p.sub_sub_category_id = ${categoryAlias}.id
        OR p.sub_sub_sub_category_id = ${categoryAlias}.id
        OR EXISTS (
          SELECT 1 FROM product_category_hierarchies pch
          WHERE pch.product_id = p.id
            AND (
              pch.category_id = ${categoryAlias}.id
              OR pch.sub_category_id = ${categoryAlias}.id
              OR pch.sub_sub_category_id = ${categoryAlias}.id
              OR pch.sub_sub_sub_category_id = ${categoryAlias}.id
            )
        )
      )
  )
`;

export const sitemapBrandHasIndexableProductSql = (brandAlias = 'brand'): string => `
  EXISTS (
    SELECT 1 FROM products p
    WHERE ${sitemapIndexableProductPredicates('p')}
      AND p.brand_id = ${brandAlias}.id
  )
`;

export const sitemapHealthConcernHasIndexableProductSql = (
  healthConcernAlias = 'healthConcern',
): string => `
  EXISTS (
    SELECT 1 FROM products p
    INNER JOIN product_health_concerns phc
      ON phc.product_id = p.id
     AND phc.health_concern_id = ${healthConcernAlias}.id
    WHERE ${sitemapIndexableProductPredicates('p')}
  )
`;

export const sitemapWellnessGoalHasIndexableProductSql = (
  wellnessGoalAlias = 'wellnessGoal',
): string => `
  EXISTS (
    SELECT 1 FROM products p
    INNER JOIN product_wellness_goals pwg
      ON pwg.product_id = p.id
     AND pwg.wellness_goal_id = ${wellnessGoalAlias}.id
    WHERE ${sitemapIndexableProductPredicates('p')}
  )
`;

/**
 * Collections (home_sections productSlider) store product refIds in jsonb.
 * Include only when ≥1 of those refIds resolves to an indexable product.
 */
export const sitemapCollectionHasIndexableProductSql = (sectionAlias = 'section'): string => `
  ${sectionAlias}.product_ref_ids IS NOT NULL
  AND jsonb_typeof(${sectionAlias}.product_ref_ids) = 'array'
  AND jsonb_array_length(${sectionAlias}.product_ref_ids) > 0
  AND EXISTS (
    SELECT 1 FROM products p
    WHERE ${sitemapIndexableProductPredicates('p')}
      AND p.ref_id IN (
        SELECT jsonb_array_elements_text(${sectionAlias}.product_ref_ids)
      )
  )
`;

export const sitemapIndexableProductParams = (): {
  sitemapProductStatus: ProductStatus;
  sitemapVariantStatus: VariantStatus;
} => ({
  sitemapProductStatus: SITEMAP_INDEXABLE_PRODUCT_STATUS,
  sitemapVariantStatus: SITEMAP_INDEXABLE_VARIANT_STATUS,
});
