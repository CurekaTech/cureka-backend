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
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  parentCategoryRefId: string | null;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
}

export interface IPublicMasterListResponse<T = unknown> extends PaginatedResult<T> {
  type: PublicMasterType;
}
