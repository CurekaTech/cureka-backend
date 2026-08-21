import { MasterStatus } from '../enums/master-status.enum';
import {
  IStorageFileReference,
  IStorageFileReferenceResponse,
} from '@packages/storage';

export interface IBrandHighlight {
  icon: IStorageFileReferenceResponse | IStorageFileReference | null;
  title: string;
  subtitle: string;
}

export interface IBrand {
  id: string;
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReferenceResponse | null;
  banner: IStorageFileReferenceResponse | null;
  video: IStorageFileReferenceResponse | null;
  featuredBanner: IStorageFileReferenceResponse | null;
  promotionalBanner: IStorageFileReferenceResponse | null;
  secondaryBanner: IStorageFileReferenceResponse | null;
  secondaryVideo: IStorageFileReferenceResponse | null;
  brandHighlights: IBrandHighlight[] | null;
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
