import { MasterStatus } from '../enums/master-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IBrand {
  id: string;
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReferenceResponse | null;
  banner: IStorageFileReferenceResponse | null;
  description: string | null;
  status: MasterStatus;
  inHomePage: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
