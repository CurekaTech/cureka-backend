import { StateEntity } from '../entities/state.entity';
import { IState, IStateSummary } from '../interfaces/state.interface';
import { mapCountryEntityToSummary } from './country.mapper';

export const mapStateEntityToResponse = (entity: StateEntity): IState => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  code: entity.code,
  countryId: entity.countryId,
  country: entity.country ? mapCountryEntityToSummary(entity.country) : null,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapStateEntityToSummary = (entity: StateEntity): IStateSummary => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  code: entity.code,
  countryId: entity.countryId,
});

export const mapStateEntitiesToResponse = (entities: StateEntity[]): IState[] =>
  entities.map(mapStateEntityToResponse);
