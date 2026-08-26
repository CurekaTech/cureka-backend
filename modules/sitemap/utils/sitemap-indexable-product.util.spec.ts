import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  sitemapBrandHasIndexableProductSql,
  sitemapCategoryHasIndexableProductSql,
  sitemapCollectionHasIndexableProductSql,
  sitemapHealthConcernHasIndexableProductSql,
  sitemapIndexableProductParams,
  sitemapWellnessGoalHasIndexableProductSql,
} from './sitemap-indexable-product.util';

describe('sitemap indexable product eligibility SQL', () => {
  it('uses published product + active variant for all listing rules', () => {
    const params = sitemapIndexableProductParams();
    expect(params).toEqual({
      sitemapProductStatus: ProductStatus.PUBLISHED,
      sitemapVariantStatus: VariantStatus.ACTIVE,
    });

    const fragments = [
      sitemapCategoryHasIndexableProductSql('category'),
      sitemapBrandHasIndexableProductSql('brand'),
      sitemapHealthConcernHasIndexableProductSql('healthConcern'),
      sitemapWellnessGoalHasIndexableProductSql('wellnessGoal'),
      sitemapCollectionHasIndexableProductSql('section'),
    ];

    for (const sql of fragments) {
      expect(sql).toContain('p.deleted_at IS NULL');
      expect(sql).toContain('p.status = :sitemapProductStatus');
      expect(sql).toContain('pv.status = :sitemapVariantStatus');
      expect(sql).toContain('pv.deleted_at IS NULL');
    }
  });

  it('matches categories via hierarchy columns and product_category_hierarchies', () => {
    const sql = sitemapCategoryHasIndexableProductSql('category');
    expect(sql).toContain('p.category_id = "category".id');
    expect(sql).toContain('p.sub_category_id = "category".id');
    expect(sql).toContain('product_category_hierarchies');
  });

  it('matches brands via products.brand_id', () => {
    expect(sitemapBrandHasIndexableProductSql('brand')).toContain('p.brand_id = "brand".id');
  });

  it('matches health concerns and wellness goals via mapping tables', () => {
    const healthSql = sitemapHealthConcernHasIndexableProductSql('healthConcern');
    expect(healthSql).toContain('product_health_concerns');
    expect(healthSql).toContain('phc.health_concern_id = "healthConcern".id');

    const wellnessSql = sitemapWellnessGoalHasIndexableProductSql('wellnessGoal');
    expect(wellnessSql).toContain('product_wellness_goals');
    expect(wellnessSql).toContain('pwg.wellness_goal_id = "wellnessGoal".id');
  });

  it('matches collections via product_ref_ids jsonb refIds', () => {
    const sql = sitemapCollectionHasIndexableProductSql('section');
    expect(sql).toContain('jsonb_array_elements_text("section".product_ref_ids)');
    expect(sql).toContain('p.ref_id IN');
  });
});
