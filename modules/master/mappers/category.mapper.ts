import { CategoryEntity } from '../entities/category.entity';
import { ICategory, ICategoryTree, IParentCategory } from '../interfaces/category.interface';
import { mapAttributeEntityToResponse } from './attribute.mapper';

const mapParentEntityToResponse = (parent: CategoryEntity | null | undefined): IParentCategory | null => {
  if (!parent) return null;
  return {
    id: parent.id,
    refId: parent.refId,
    name: parent.name,
    hierarchyId: parent.hierarchyId,
    hierarchyLevel: parent.hierarchyLevel,
    slug: parent.slug,
    position: parent.position,
  };
};

export const mapCategoryEntityToResponse = (entity: CategoryEntity): ICategory => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  hierarchyId: entity.hierarchyId,
  parentCategoryRefId: entity.parent?.refId ?? null,
  position: entity.position,
  hierarchyLevel: entity.hierarchyLevel,
  image: entity.image,
  banner: entity.banner,
  slug: entity.slug,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  metaKeywords: entity.metaKeywords,
  isInHeader: entity.isInHeader,
  isInShopBy: entity.isInShopBy,
  status: entity.status,
  parent: mapParentEntityToResponse(entity.parent),
  attributes: (entity.attributes ?? []).map(mapAttributeEntityToResponse),
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapCategoryEntitiesToResponse = (entities: CategoryEntity[]): ICategory[] =>
  entities.map(mapCategoryEntityToResponse);

export const mapCategoryEntityToTree = (entity: CategoryEntity): ICategoryTree => ({
  ...mapCategoryEntityToResponse(entity),
  children: [],
});
