import { ManufacturerEntity } from '../entities/manufacturer.entity';
import { IManufacturer, IManufacturerCategorySummary } from '../interfaces/manufacturer.interface';
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
  address: entity.address,
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
