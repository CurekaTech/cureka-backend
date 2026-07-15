export enum HomeSectionType {
  HERO_BANNER = 'heroBanner',
  BUILT_BY_DOCTORS_BANNER = 'builtByDoctorsBanner',
  SHOP_BY_CATEGORY = 'shopByCategory',
  SHOP_BY_WELLNESS_GOALS = 'shopByWellnessGoals',
  BEST_SELLERS = 'bestSellers',
  EXPERT_CURATED_BUNDLES = 'expertCuratedBundles',
  FESTIVAL_BANNERS = 'festivalBanners',
  BRAND_BANNERS = 'brandBanners',
  BRANDS_WE_TRUST = 'brandsWeTrust',
  CURATED_WELLNESS_ESSENTIALS = 'curatedWellnessEssentials',
  CONSULT_DOCTORS = 'consultDoctors',
  HEALTH_READS = 'healthReads',
  WATCH_AND_SHOP = 'watchAndShop',
  /** Admin-created custom sections (multiple allowed). */
  BANNER = 'banner',
  PRODUCT_SLIDER = 'productSlider',
  CATEGORY_SLIDER = 'categorySlider',
}

/** Types that may have many rows; not unique by type. */
export const CUSTOM_HOME_SECTION_TYPES: ReadonlySet<HomeSectionType> = new Set([
  HomeSectionType.BANNER,
  HomeSectionType.PRODUCT_SLIDER,
  HomeSectionType.CATEGORY_SLIDER,
]);

export const isCustomHomeSectionType = (type: HomeSectionType): boolean =>
  CUSTOM_HOME_SECTION_TYPES.has(type);
