export interface IResolvedProductMasters {
  productNatureId: string | null;
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  brandId: string;
  manufacturerId: string | null;
  packerId: string | null;
  importerId: string | null;
  countryOfOriginId: string | null;
  healthConcernIds: string[];
  wellnessGoalIds: string[];
  faqIds: string[];
  attributeIds: string[];
  attributeIdByRefId: Map<string, string>;
  categoryFilterBindings: Array<{ categoryFilterId: string; values: string[] }>;
}
