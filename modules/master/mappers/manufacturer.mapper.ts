import { ManufacturerEntity } from '../entities/manufacturer.entity';
import { IManufacturer, IManufacturerCategorySummary } from '../interfaces/manufacturer.interface';
import { mapCityEntityToSummary } from './city.mapper';
import { mapStateEntityToSummary } from './state.mapper';
import { mapCountryEntityToSummary } from './country.mapper';
import { CategoryEntity } from '../entities/category.entity';

const mapCategoryToSummary = (category: CategoryEntity): IManufacturerCategorySummary => ({
  id: category.id,
  refId: category.refId,
  name: category.name,
});

export const mapManufacturerEntityToResponse = (entity: ManufacturerEntity): IManufacturer => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  code: entity.code,
  logo: entity.logo,
  description: entity.description,
  contactPerson: entity.contactPerson,
  email: entity.email,
  mobileNumber: entity.mobileNumber,
  addressLine1: entity.addressLine1,
  addressLine2: entity.addressLine2,
  landmark: entity.landmark,
  cityId: entity.cityId,
  stateId: entity.stateId,
  countryId: entity.countryId,
  city: entity.city ? mapCityEntityToSummary(entity.city) : null,
  state: entity.state ? mapStateEntityToSummary(entity.state) : null,
  country: entity.country ? mapCountryEntityToSummary(entity.country) : null,
  pinCode: entity.pinCode,
  gstNumber: entity.gstNumber,
  drugLicenseNumber: entity.drugLicenseNumber,
  status: entity.status,
  categories: (entity.categories ?? []).map(mapCategoryToSummary),
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapManufacturerEntitiesToResponse = (entities: ManufacturerEntity[]): IManufacturer[] =>
  entities.map(mapManufacturerEntityToResponse);
