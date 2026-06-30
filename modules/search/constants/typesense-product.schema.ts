export const PRODUCT_COLLECTION_FIELDS = [
  { name: 'id', type: 'string' as const },
  { name: 'name', type: 'string' as const },
  { name: 'slug', type: 'string' as const },
  { name: 'brand', type: 'string' as const, optional: true },
  { name: 'category', type: 'string' as const, optional: true },
  { name: 'subCategory', type: 'string' as const, optional: true },
  { name: 'healthConcerns', type: 'string' as const, optional: true },
  { name: 'wellnessGoals', type: 'string' as const, optional: true },
  { name: 'tags', type: 'string' as const, optional: true },
  { name: 'description', type: 'string' as const, optional: true },
  { name: 'inStock', type: 'bool' as const, optional: true },
  { name: 'minSellingPrice', type: 'float' as const, optional: true },
] as const;

export const PRODUCT_SEARCH_QUERY_FIELDS = [
  'name',
  'brand',
  'category',
  'subCategory',
  'healthConcerns',
  'wellnessGoals',
  'tags',
  'description',
] as const;

export const PRODUCT_POPULAR_SORT_FIELD = 'minSellingPrice';
