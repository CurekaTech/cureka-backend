import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { IAttribute } from './attribute.interface';
export interface IParentCategory {
  id: string;
  refId: string;
  name: string;
  hierarchyId: number;
  hierarchyLevel: CategoryHierarchyLevel;
  slug: string;
  position: number;
}

export interface ICategory {
  id: string;
  refId: string;
  name: string;
  hierarchyId: number;
  parentCategoryId: string | null;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  image: string | null;
  banner: string | null;
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  isInHeader: boolean;
  isInShopBy: boolean;
  status: MasterStatus;
  parent: IParentCategory | null;
  attributes: IAttribute[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface ICategoryTree extends ICategory {
  children: ICategoryTree[];
}
