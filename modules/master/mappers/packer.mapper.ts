import { PackerEntity } from '../entities/packer.entity';
import { IPacker } from '../interfaces/packer.interface';
import { mapCityEntityToSummary } from './city.mapper';
import { mapStateEntityToSummary } from './state.mapper';
import { mapCountryEntityToSummary } from './country.mapper';

export const mapPackerEntityToResponse = (entity: PackerEntity): IPacker => ({
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
  remarks: entity.remarks,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapPackerEntitiesToResponse = (entities: PackerEntity[]): IPacker[] =>
  entities.map(mapPackerEntityToResponse);
