import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';

/**
 * Hierarchy levels allowed for "Show on homepage" (isInShopBy):
 * root, subcategory, and sub-subcategory.
 */
export const HOMEPAGE_SHOP_BY_HIERARCHY_LEVELS: readonly CategoryHierarchyLevel[] = [
  CategoryHierarchyLevel.ROOT,
  CategoryHierarchyLevel.CHILD,
  CategoryHierarchyLevel.GRANDCHILD,
] as const;

export const isHomepageShopByHierarchyLevel = (
  level: CategoryHierarchyLevel,
): boolean => HOMEPAGE_SHOP_BY_HIERARCHY_LEVELS.includes(level);
