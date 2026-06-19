import { PackerEntity } from '../entities/packer.entity';
import { IPacker } from '../interfaces/packer.interface';

export const mapPackerEntityToResponse = (entity: PackerEntity): IPacker =>
  ({
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
  remarks: entity.remarks,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
  }) as IPacker;

export const mapPackerEntitiesToResponse = (entities: PackerEntity[]): IPacker[] =>
  entities.map(mapPackerEntityToResponse);
