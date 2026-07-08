/** Allowed `sortBy` values for admin GET /products list. */
export const ADMIN_PRODUCT_LIST_SORT_FIELDS = [
  'refId',
  'name',
  'slug',
  'productType',
  'status',
  'categoryName',
  'brandName',
  'productNatureName',
  'price',
  'stock',
  'sku',
  'publishedAt',
  'createdAt',
  'updatedAt',
] as const;

export type AdminProductListSortField = (typeof ADMIN_PRODUCT_LIST_SORT_FIELDS)[number];

export const DEFAULT_ADMIN_PRODUCT_LIST_SORT: AdminProductListSortField = 'createdAt';
