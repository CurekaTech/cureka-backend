export interface ITypesenseSearchDocument {
  id: string;
  refId: string;
  entityType: string;
  name: string;
  slug: string;
  brand?: string;
  category?: string;
  subCategory?: string;
  healthConcerns?: string;
  wellnessGoals?: string;
  tags?: string;
  searchTags?: string;
  sku?: string;
  variantId?: string;
  variantSlug?: string;
  /** Legacy storefront path (`/shop/.../`) when available. */
  productPageUrl?: string;
  /** Nested category listing path (`/product-category/l1/l2/...`). */
  permalink?: string;
  description?: string;
  inStock?: boolean;
  minSellingPrice?: number;
}

/** @deprecated Use ITypesenseSearchDocument */
export type ITypesenseProductDocument = ITypesenseSearchDocument;
