import { MasterStatus } from '../enums/master-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IHealthConcern {
  id: string;
  refId: string;
  name: string;
  icon: IStorageFileReferenceResponse | null;
  slug: string;
  description: string | null;
  banner: IStorageFileReferenceResponse | null;
  status: MasterStatus;
  inHomePage: boolean;
  sortIndex: number | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
