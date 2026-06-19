import { ImporterEntity } from '../entities/importer.entity';
import { IImporter } from '../interfaces/importer.interface';

export const mapImporterEntityToResponse = (entity: ImporterEntity): IImporter =>
  ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  code: entity.code,
  iec: entity.iec,
  logo: entity.logo,
  contactPerson: entity.contactPerson,
  email: entity.email,
  mobileNumber: entity.mobileNumber,
  address: entity.address,
  gstNumber: entity.gstNumber,
  drugLicenseNumber: entity.drugLicenseNumber,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
  }) as IImporter;

export const mapImporterEntitiesToResponse = (entities: ImporterEntity[]): IImporter[] =>
  entities.map(mapImporterEntityToResponse);
