import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';

export interface ICategoryProductIndexingCategory {
  refId: string;
  name: string;
  slug: string;
  hierarchyLevel: CategoryHierarchyLevel;
  /** Human-readable hierarchy, e.g. "Main Category" / "Sub Category". */
  hierarchyLabel: string;
}

export interface ICategoryTopProductVariant {
  id: string;
  sku: string;
  slug: string;
  productRefId: string;
  productName: string;
  isTop: boolean;
  topSortOrder: number | null;
}

export interface ICategoryTopProductsSaveResult {
  category: ICategoryProductIndexingCategory;
  selectedCount: number;
  clearedCount: number;
  variants: ICategoryTopProductVariant[];
}

export interface ICategoryTopProductsReorderResult {
  category: ICategoryProductIndexingCategory;
  updatedCount: number;
  variants: ICategoryTopProductVariant[];
}
