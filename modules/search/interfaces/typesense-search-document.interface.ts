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
  description?: string;
  inStock?: boolean;
  minSellingPrice?: number;
}

/** @deprecated Use ITypesenseSearchDocument */
export type ITypesenseProductDocument = ITypesenseSearchDocument;
