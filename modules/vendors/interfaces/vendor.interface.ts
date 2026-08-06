import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { VendorSource } from '../enums/vendor-source.enum';
import { VendorStatus } from '../enums/vendor-status.enum';

export interface IVendor {
  id: string;
  refId: string;
  userId: string;
  userRefId: string | null;
  companyName: string;
  contactPerson: string;
  email: string;
  mobileNumber: string;
  businessAddress: string;
  warehouseAddress: string;
  warehousePincode: string;
  warehouseContactPerson: string | null;
  warehouseContactPhone: string | null;
  panNumber: string;
  panDocument: IStorageFileReference | IStorageFileReferenceResponse | null;
  gstNumber: string;
  gstCertificateDocument: IStorageFileReference | IStorageFileReferenceResponse | null;
  productExcelSheet: IStorageFileReference | IStorageFileReferenceResponse | null;
  productCategories: string | null;
  brandDetails: string | null;
  companyProfile: string | null;
  status: VendorStatus;
  source: VendorSource;
  warehouseCode: string | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
