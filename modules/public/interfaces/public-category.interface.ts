import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

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
