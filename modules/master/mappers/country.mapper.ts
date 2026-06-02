import { CountryEntity } from '../entities/country.entity';
import { ICountry, ICountrySummary } from '../interfaces/country.interface';

export const mapCountryEntityToSummary = (entity: CountryEntity | ICountrySummary): ICountrySummary => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  code: entity.code,
});

export const mapCountryEntityToResponse = (entity: CountryEntity): ICountry => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  code: entity.code,
  phoneCode: entity.phoneCode,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapCountryEntitiesToResponse = (entities: CountryEntity[]): ICountry[] =>
  entities.map(mapCountryEntityToResponse);
