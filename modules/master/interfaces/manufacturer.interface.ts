import { MasterStatus } from '../enums/master-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IManufacturerCategorySummary {
  id: string;
  refId: string;
  name: string;
}

export interface IManufacturer {
  id: string;
  refId: string;
  name: string;
  code: string;
  logo: IStorageFileReferenceResponse | null;
  description: string | null;
  contactPerson: string | null;
  email: string | null;
  mobileNumber: string | null;
  address: string | null;
  gstNumber: string | null;
  drugLicenseNumber: string | null;
  status: MasterStatus;
  categories: IManufacturerCategorySummary[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
