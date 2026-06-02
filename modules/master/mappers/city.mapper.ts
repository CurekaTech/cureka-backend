import { CityEntity } from '../entities/city.entity';
import { ICity } from '../interfaces/city.interface';
import { mapStateEntityToSummary } from './state.mapper';

export const mapCityEntityToResponse = (entity: CityEntity): ICity => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  stateId: entity.stateId,
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
