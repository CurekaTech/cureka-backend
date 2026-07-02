export const SEARCH_ENTITY_TYPES = {
  PRODUCT: 'Product',
  BRAND: 'Brand',
  CATEGORY: 'Category',
  HEALTH_CONCERN: 'Health Concern',
  LAB_TEST: 'Lab Test',
  DOCTOR: 'Doctor',
} as const;

export type SearchEntityType =
  (typeof SEARCH_ENTITY_TYPES)[keyof typeof SEARCH_ENTITY_TYPES];
