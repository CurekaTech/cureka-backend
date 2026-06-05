import { AttributeEntity } from '../entities/attribute.entity';
import { IAttribute } from '../interfaces/attribute.interface';

export const mapAttributeEntityToResponse = (entity: AttributeEntity): IAttribute => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  dataType: entity.dataType ?? null,
  values: entity.values ?? null,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapAttributeEntitiesToResponse = (entities: AttributeEntity[]): IAttribute[] =>
  entities.map(mapAttributeEntityToResponse);
