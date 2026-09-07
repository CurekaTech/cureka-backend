import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { PublicListingContextType } from '../enums/public-listing-context-type.enum';

export interface IPublicFacetCategoryNode {
  id: string;
  refId: string;
  name: string;
  slug: string;
  slugPath: string[];
  permalink: string;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  type: string;
  productCount: number;
  selected: boolean;
  children: IPublicFacetCategoryNode[];
}

export interface IPublicFacetBrandItem {
  id: string;
  refId: string;
  name: string;
  slug: string;
  productCount: number;
  selected: boolean;
}

export interface IPublicFacetOptionItem {
  id: string;
  name: string;
  productCount: number;
  selected: boolean;
}

export interface IPublicFacetFilterGroup {
  id: string;
  name: string;
  type: 'checkbox';
  items: IPublicFacetOptionItem[];
}

export interface IPublicFacetCursorPage<T> {
  items: T[];
  selectedItems: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface IPublicFacetPriceRange {
  min: number | null;
  max: number | null;
}

export interface IPublicProductFiltersResponse {
  contextType: PublicListingContextType;
  categories: IPublicFacetCursorPage<IPublicFacetCategoryNode>;
  brands: IPublicFacetCursorPage<IPublicFacetBrandItem>;
  priceRange: IPublicFacetPriceRange;
  filters: IPublicFacetFilterGroup[];
}
