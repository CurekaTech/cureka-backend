import { CategoryEntity } from '@modules/master/entities/category.entity';
import { IPublicCategoryTree, IPublicHeaderCategory } from '../interfaces/public-category.interface';
import { IPublicCategoryListItem } from '../interfaces/public-master.interface';

export const mapCategoryEntityToPublicTree = (
  entity: CategoryEntity,
  children: IPublicCategoryTree[] = [],
): IPublicCategoryTree =>
  ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  image: entity.image,
  banner: entity.banner,
  position: entity.position,
  hierarchyLevel: entity.hierarchyLevel,
  isInHeader: entity.isInHeader,
  isInShopBy: entity.isInShopBy,
  children,
  }) as IPublicCategoryTree;

export const mapHeaderCategoryEntity = (
  entity: CategoryEntity,
  children: IPublicHeaderCategory[] = [],
): IPublicHeaderCategory => ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  position: entity.position,
  hierarchyLevel: entity.hierarchyLevel,
  isInHeader: entity.isInHeader,
  isInShopBy: entity.isInShopBy,
  children, 
});

export const mapCategoryEntityToPublicListItem = (
  entity: CategoryEntity,
): IPublicCategoryListItem => ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  position: entity.position,
  hierarchyLevel: entity.hierarchyLevel,
  parentCategoryRefId: entity.parent?.refId ?? null,
  image: entity.image,
  banner: entity.banner,
});

export const mapCategoryEntitiesToPublicListItems = (
  entities: CategoryEntity[],
): IPublicCategoryListItem[] => entities.map(mapCategoryEntityToPublicListItem);
