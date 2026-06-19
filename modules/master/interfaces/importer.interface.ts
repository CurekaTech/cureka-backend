import { MasterStatus } from '../enums/master-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IImporter {
  id: string;
  refId: string;
  name: string;
  code: string;
  iec: string | null;
  logo: IStorageFileReferenceResponse | null;
  contactPerson: string | null;
  email: string | null;
  mobileNumber: string | null;
  address: string | null;
  gstNumber: string | null;
  drugLicenseNumber: string | null;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
