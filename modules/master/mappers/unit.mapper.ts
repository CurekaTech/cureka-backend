import { UnitEntity } from '../entities/unit.entity';
import { IUnit } from '../interfaces/unit.interface';

export const mapUnitEntityToResponse = (entity: UnitEntity): IUnit => ({
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

export const mapUnitEntitiesToResponse = (entities: UnitEntity[]): IUnit[] =>
  entities.map(mapUnitEntityToResponse);
