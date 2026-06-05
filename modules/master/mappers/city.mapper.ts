import { CityEntity } from '../entities/city.entity';
import { ICity, ICitySummary } from '../interfaces/city.interface';
import { mapStateEntityToSummary } from './state.mapper';

export const mapCityEntityToSummary = (entity: CityEntity): ICitySummary => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  stateId: entity.stateId,
});

export const mapCityEntityToResponse = (entity: CityEntity): ICity => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  stateRefId: entity.state?.refId ?? '',
  state: entity.state ? mapStateEntityToSummary(entity.state) : null,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapCityEntitiesToResponse = (entities: CityEntity[]): ICity[] =>
  entities.map(mapCityEntityToResponse);
