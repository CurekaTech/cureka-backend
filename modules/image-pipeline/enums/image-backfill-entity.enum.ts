export enum ImageBackfillEntityType {
  BANNERS = 'banners',
  HOME_SECTIONS = 'home-sections',
  PRODUCTS = 'products',
  BRANDS = 'brands',
  CATEGORIES = 'categories',
  HEALTH_CONCERNS = 'health-concerns',
  WELLNESS_GOALS = 'wellness-goals',
  BLOG = 'blog',
  WATCH_AND_SHOP = 'watch-and-shop',
  EXPERT_TALK = 'expert-talk',
  TESTIMONIALS = 'testimonials',
  GALLERY = 'gallery',
  MANUFACTURERS = 'manufacturers',
  PACKERS = 'packers',
  IMPORTERS = 'importers',
}

export const HOMEPAGE_PRIORITY_ENTITY_TYPES: ImageBackfillEntityType[] = [
  ImageBackfillEntityType.BANNERS,
  ImageBackfillEntityType.HOME_SECTIONS,
  ImageBackfillEntityType.PRODUCTS,
  ImageBackfillEntityType.BRANDS,
  ImageBackfillEntityType.CATEGORIES,
  ImageBackfillEntityType.HEALTH_CONCERNS,
];

export const ALL_IMAGE_BACKFILL_ENTITY_TYPES: ImageBackfillEntityType[] =
  Object.values(ImageBackfillEntityType);
