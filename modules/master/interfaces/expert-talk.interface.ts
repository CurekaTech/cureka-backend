import { IStorageFileReferenceResponse } from '@packages/storage';
import { ExpertTalkContentType } from '../enums/expert-talk-content-type.enum';
import { MasterStatus } from '../enums/master-status.enum';

export interface IExpertTalkItem {
  id: string;
  refId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnail: IStorageFileReferenceResponse | null;
  contentType: ExpertTalkContentType;
  sortOrder: number;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface IStorefrontExpertTalkItem {
  refId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnail: IStorageFileReferenceResponse | null;
  contentType: ExpertTalkContentType;
  sortOrder: number;
}
