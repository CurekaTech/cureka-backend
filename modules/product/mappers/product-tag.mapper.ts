import { ProductTagEntity } from '../entities/product-tag.entity';
import { IProductTagMaster } from '../interfaces/product-tag-master.interface';

export const mapProductTagEntityToResponse = (entity: ProductTagEntity): IProductTagMaster => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapProductTagEntitiesToResponse = (
  entities: ProductTagEntity[],
): IProductTagMaster[] => entities.map(mapProductTagEntityToResponse);
