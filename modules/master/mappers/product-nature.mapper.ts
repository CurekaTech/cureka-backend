import { ProductNatureEntity } from '../entities/product-nature.entity';
import { IProductNature } from '../interfaces/product-nature.interface';

export const mapProductNatureEntityToResponse = (entity: ProductNatureEntity): IProductNature => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapProductNatureEntitiesToResponse = (
  entities: ProductNatureEntity[],
): IProductNature[] => entities.map(mapProductNatureEntityToResponse);
