export interface ITypesenseProductDocument {
  id: string;
  name: string;
  slug: string;
  brand?: string;
  category?: string;
  subCategory?: string;
  healthConcerns?: string;
  wellnessGoals?: string;
  tags?: string;
  description?: string;
  inStock?: boolean;
  minSellingPrice?: number;
}
