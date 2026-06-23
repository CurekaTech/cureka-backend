import { CategoryFilterEntity } from '../entities/category-filter.entity';
import { ICategoryFilter } from '../interfaces/category-filter.interface';

export const mapCategoryFilterEntityToResponse = (
  entity: CategoryFilterEntity,
): ICategoryFilter => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  status: entity.status,
  values: entity.values ?? null,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapCategoryFilterEntitiesToResponse = (
  entities: CategoryFilterEntity[],
): ICategoryFilter[] => entities.map(mapCategoryFilterEntityToResponse);
