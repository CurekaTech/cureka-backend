import { AgeGroupEntity } from '../entities/age-group.entity';
import { IAgeGroup } from '../interfaces/age-group.interface';

export const mapAgeGroupEntityToResponse = (entity: AgeGroupEntity): IAgeGroup => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  fromYears: entity.fromYears,
  fromMonths: entity.fromMonths,
  toYears: entity.toYears,
  toMonths: entity.toMonths,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapAgeGroupEntitiesToResponse = (entities: AgeGroupEntity[]): IAgeGroup[] =>
  entities.map(mapAgeGroupEntityToResponse);
