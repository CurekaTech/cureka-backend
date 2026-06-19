import { MasterStatus } from '../enums/master-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IPacker {
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
  remarks: string | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
