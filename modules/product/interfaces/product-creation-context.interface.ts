export interface IResolvedCategoryHierarchy {
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  sortOrder: number;
}

export interface IResolvedProductMasters {
  productNatureId: string | null;
  /** Primary hierarchy (first entry) — mirrored on products.* category FK columns. */
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  /** All independent category hierarchies for the product. */
  categoryHierarchies: IResolvedCategoryHierarchy[];
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
