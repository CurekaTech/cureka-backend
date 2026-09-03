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
  /** Ordered category slugs from root → current listing category (usually root). */
  slugPath: string[];
  /** Legacy-compatible path, e.g. /product-category/herbal-ayurveda */
  permalink: string;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  aboveTheFold: string | null;
  belowTheFold: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  categoryFilters: IPublicCategoryFilterFacet[];
  /** The category from categorySlug / categoryRefId (root or child). */
  selectedCategory?: {
    refId: string;
    name: string;
    slug: string;
    slugPath: string[];
    permalink: string;
    image: IStorageFileReference | IStorageFileReferenceResponse | null;
    banner: IStorageFileReference | IStorageFileReferenceResponse | null;
    aboveTheFold: string | null;
    belowTheFold: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
  } | null;
}

export interface IPublicCategoryTree {
  refId: string;
  name: string;
  slug: string;
  /** Ordered category slugs from root → this node. */
  slugPath: string[];
  /** Legacy-compatible path, e.g. /product-category/herbal-ayurveda/herbal-oil/castor-oil */
  permalink: string;
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
  /** Ordered category slugs from root → this node. */
  slugPath: string[];
  /** Legacy-compatible path, e.g. /product-category/herbal-ayurveda/herbal-oil/castor-oil */
  permalink: string;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  isInHeader: boolean;
  isInShopBy: boolean;
  children: IPublicHeaderCategory[];
}
