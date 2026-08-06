import { VendorEntity } from '../entities/vendor.entity';
import { IVendor } from '../interfaces/vendor.interface';

export const mapVendorEntityToResponse = (entity: VendorEntity): IVendor => ({
  id: entity.id,
  refId: entity.refId,
  userId: entity.userId,
  userRefId: entity.user?.refId ?? null,
  companyName: entity.companyName,
  contactPerson: entity.contactPerson,
  email: entity.email,
  mobileNumber: entity.mobileNumber,
  businessAddress: entity.businessAddress,
  warehouseAddress: entity.warehouseAddress,
  warehousePincode: entity.warehousePincode,
  warehouseContactPerson: entity.warehouseContactPerson,
  warehouseContactPhone: entity.warehouseContactPhone,
  panNumber: entity.panNumber,
  panDocument: entity.panDocument,
  gstNumber: entity.gstNumber,
  gstCertificateDocument: entity.gstCertificateDocument,
  productExcelSheet: entity.productExcelSheet,
  productCategories: entity.productCategories,
  brandDetails: entity.brandDetails,
  companyProfile: entity.companyProfile,
  status: entity.status,
  source: entity.source,
  warehouseCode: entity.warehouseCode,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapVendorEntitiesToResponse = (entities: VendorEntity[]): IVendor[] =>
  entities.map(mapVendorEntityToResponse);
