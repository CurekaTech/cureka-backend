/**
 * Section types that already fit the CMS (home sections, banners, blogs, catalog).
 * Sponsored placements are intentionally absent: this codebase has no sponsored-ad module to reuse.
 */
export enum PromotionalSectionType {
  HERO_BANNER = 'heroBanner',
  PRODUCT_COLLECTION = 'productCollection',
  CATEGORY = 'category',
  BRAND = 'brand',
  VIDEO = 'video',
  BLOG = 'blog',
}
