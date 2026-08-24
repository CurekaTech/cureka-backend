import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

/** Parent summary for brand category filter rows. */
export interface IPublicBrandCategoryFilterParent {
  id: string;
  refId: string;
  name: string;
  slug: string;
  hierarchyLevel: CategoryHierarchyLevel;
  /** UI label: CATEGORY | SUB_CATEGORY | SUB_SUB_CATEGORY | SUB_SUB_SUB_CATEGORY */
  type: string;
}

/**
 * One category that has ≥1 published product for the selected brand.
 * Used by brand PLP filter UI.
 */
export interface IPublicBrandCategoryFilterItem {
  id: string;
  refId: string;
  name: string;
  slug: string;
  /** Ordered slugs from root → this category. */
  slugPath: string[];
  permalink: string;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  /** UI label derived from hierarchyLevel. */
  type: string;
  parentCategoryRefId: string | null;
  parent: IPublicBrandCategoryFilterParent | null;
  /** Published products of this brand assigned to this category (any hierarchy slot). */
  productCount: number;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
}

export const mapHierarchyLevelToFilterType = (level: CategoryHierarchyLevel | number): string => {
  switch (Number(level)) {
    case CategoryHierarchyLevel.ROOT:
      return 'CATEGORY';
    case CategoryHierarchyLevel.CHILD:
      return 'SUB_CATEGORY';
    case CategoryHierarchyLevel.GRANDCHILD:
      return 'SUB_SUB_CATEGORY';
    case CategoryHierarchyLevel.GREAT_GRANDCHILD:
      return 'SUB_SUB_SUB_CATEGORY';
    default:
      return 'CATEGORY';
  }
};
