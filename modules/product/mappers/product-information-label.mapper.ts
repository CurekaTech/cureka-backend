import { ProductInformationLabelEntity } from '../entities/product-information-label.entity';
import { IProductInformationLabel } from '../interfaces/product-information-label.interface';

export const mapProductInformationLabelEntityToResponse = (
  entity: ProductInformationLabelEntity,
): IProductInformationLabel => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  status: entity.status,
  sortOrder: entity.sortOrder,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapProductInformationLabelEntitiesToResponse = (
  entities: ProductInformationLabelEntity[],
): IProductInformationLabel[] => entities.map(mapProductInformationLabelEntityToResponse);
