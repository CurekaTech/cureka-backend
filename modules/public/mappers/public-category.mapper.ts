import { CategoryEntity } from '@modules/master/entities/category.entity';
import {
  IPublicCategoryTree,
  IPublicHeaderCategory,
} from '../interfaces/public-category.interface';
import { IPublicCategoryListItem } from '../interfaces/public-master.interface';
import {
  buildCategoryPermalink,
  buildCategorySlugPath,
} from '../utils/category-permalink.util';

export const mapCategoryEntityToPublicTree = (
  entity: CategoryEntity,
  children: IPublicCategoryTree[] = [],
  parentSlugPath: string[] = [],
): IPublicCategoryTree => {
  const slugPath = buildCategorySlugPath(...parentSlugPath, entity.slug);
  return {
    refId: entity.refId,
    name: entity.name,
    slug: entity.slug,
    slugPath,
    permalink: buildCategoryPermalink(slugPath),
    image: entity.image,
    banner: entity.banner,
    faqBanner: entity.faqBanner,
    position: entity.position,
    hierarchyLevel: entity.hierarchyLevel,
    isInHeader: entity.isInHeader,
    isInShopBy: entity.isInShopBy,
    children,
  } as IPublicCategoryTree;
};

export const mapHeaderCategoryEntity = (
  entity: CategoryEntity,
  children: IPublicHeaderCategory[] = [],
  parentSlugPath: string[] = [],
): IPublicHeaderCategory => {
  const slugPath = buildCategorySlugPath(...parentSlugPath, entity.slug);
  return {
    refId: entity.refId,
    name: entity.name,
    slug: entity.slug,
    slugPath,
    permalink: buildCategoryPermalink(slugPath),
    children,
  };
};

export const mapCategoryEntityToPublicListItem = (
  entity: CategoryEntity,
  parentSlugPath: string[] = [],
): IPublicCategoryListItem => {
  const slugPath = buildCategorySlugPath(...parentSlugPath, entity.slug);
  return {
    refId: entity.refId,
    name: entity.name,
    slug: entity.slug,
    slugPath,
    permalink: buildCategoryPermalink(slugPath),
    position: entity.position,
    hierarchyLevel: entity.hierarchyLevel,
    parentCategoryRefId: entity.parent?.refId ?? null,
    image: entity.image,
    banner: entity.banner,
    faqBanner: entity.faqBanner,
  };
};

export const mapCategoryEntitiesToPublicListItems = (
  entities: CategoryEntity[],
): IPublicCategoryListItem[] => entities.map((entity) => mapCategoryEntityToPublicListItem(entity));

export const buildPublicCategoryListTree = (
  root: CategoryEntity,
  descendants: CategoryEntity[],
): IPublicCategoryListItem => {
  const childrenByParentId = new Map<string, CategoryEntity[]>();

  for (const category of descendants) {
    if (!category.parentCategoryId) continue;
    const siblings = childrenByParentId.get(category.parentCategoryId) ?? [];
    siblings.push(category);
    childrenByParentId.set(category.parentCategoryId, siblings);
  }

  const sortCategories = (items: CategoryEntity[]): CategoryEntity[] =>
    [...items].sort((a, b) => a.position - b.position || a.hierarchyId - b.hierarchyId);

  const buildNode = (
    entity: CategoryEntity,
    parentSlugPath: string[] = [],
  ): IPublicCategoryListItem => {
    const mapped = mapCategoryEntityToPublicListItem(entity, parentSlugPath);
    const children = sortCategories(childrenByParentId.get(entity.id) ?? []).map((child) =>
      buildNode(child, mapped.slugPath),
    );
    return {
      ...mapped,
      ...(children.length > 0 ? { children } : {}),
    };
  };

  return buildNode(root);
};
