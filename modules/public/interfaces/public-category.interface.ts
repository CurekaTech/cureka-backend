import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

export interface IPublicCategoryFilterFacet {
  refId: string;
  name: string;
  /**
   * Distinct values from published products in this category tree.
   * Falls back to master-defined allowed values when no products are bound yet.
   */
  values: string[];
}

/** Category metadata returned when the product list is scoped by categorySlug/categoryRefId. */
export interface IPublicCategoryProductListingContext {
  refId: string;
  name: string;
  slug: string;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  aboveTheFold: string | null;
  belowTheFold: string | null;
  categoryFilters: IPublicCategoryFilterFacet[];
  /** Set when the listing is filtered by a child category (non-root). */
  selectedCategory?: {
    refId: string;
    name: string;
    slug: string;
  } | null;
}

export interface IPublicCategoryTree {
  refId: string;
  name: string;
  slug: string;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  isInHeader: boolean;
  isInShopBy: boolean;
  children: IPublicCategoryTree[];
}

export interface IPublicHeaderCategory {
  refId: string;
  name: string;
  slug: string;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  isInHeader: boolean;
  isInShopBy: boolean;
  children: IPublicHeaderCategory[];
}
