import { PaginatedResult } from '@packages/common';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { PublicMasterType } from '../enums/public-master-type.enum';

export interface IPublicBrandListItem {
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReference | IStorageFileReferenceResponse | null;
}

export interface IPublicCategoryListItem {
  refId: string;
  name: string;
  slug: string;
  /** Ordered category slugs from root → this node. */
  slugPath: string[];
  /** Legacy-compatible path, e.g. /product-category/herbal-ayurveda/herbal-oil */
  permalink: string;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  parentCategoryRefId: string | null;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  faqBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  children?: IPublicCategoryListItem[];
}

export interface IPublicMasterListResponse<T = unknown> extends PaginatedResult<T> {
  type: PublicMasterType;
}
