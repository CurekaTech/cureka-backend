export enum PublicListingContextType {
  CATEGORY = 'category',
  BRAND = 'brand',
  SEARCH = 'search',
  HEALTH_CONCERN = 'healthConcern',
  WELLNESS_GOAL = 'wellnessGoal',
  TAG = 'tag',
  MIXED = 'mixed',
}

export enum PublicProductFacet {
  BRANDS = 'brands',
  CATEGORIES = 'categories',
  CATEGORY_FILTERS = 'categoryFilters',
  PRICE = 'price',
}

export type LockedFacetKey =
  | 'category'
  | 'brand'
  | 'search'
  | 'healthConcern'
  | 'wellnessGoal'
  | 'tag';
