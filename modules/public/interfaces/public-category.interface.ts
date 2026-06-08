import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';

export interface IPublicCategoryTree {
  refId: string;
  name: string;
  slug: string;
  image: string | null;
  banner: string | null;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  isInHeader: boolean;
  isInShopBy: boolean;
  children: IPublicCategoryTree[];
}
