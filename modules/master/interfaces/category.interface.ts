import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { IAttribute } from './attribute.interface';
import { ICategoryFilter } from './category-filter.interface';
import { IStorageFileReferenceResponse } from '@packages/storage';
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
  parentCategoryRefId: string | null;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  image: IStorageFileReferenceResponse | null;
  banner: IStorageFileReferenceResponse | null;
  faqBanner: IStorageFileReferenceResponse | null;
  slug: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  aboveTheFold: string | null;
  belowTheFold: string | null;
  faqs: Array<{ question: string; answer: string }>;
  isInHeader: boolean;
  isInShopBy: boolean;
  bestsellerSortIndex: number | null;
  status: MasterStatus;
  parent: IParentCategory | null;
  attributes: IAttribute[];
  categoryFilters: ICategoryFilter[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface ICategoryForProduct {
  id: string;
  refId: string;
  name: string;
  slug: string;
  position: number;
}

export interface ICategoryTree extends ICategory {
  children: ICategoryTree[];
}
