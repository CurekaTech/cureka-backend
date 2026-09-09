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
  showBanner: boolean;
  video: IStorageFileReferenceResponse | null;
  showVideo: boolean;
  featuredBanner: IStorageFileReferenceResponse | null;
  showFeaturedBanner: boolean;
  promotionalBanner: IStorageFileReferenceResponse | null;
  showPromotionalBanner: boolean;
  secondaryBanner: IStorageFileReferenceResponse | null;
  showSecondaryBanner: boolean;
  secondaryVideo: IStorageFileReferenceResponse | null;
  showSecondaryVideo: boolean;
  offerBanner: IStorageFileReferenceResponse | null;
  showOfferBanner: boolean;
  brandHighlights: IBrandHighlight[] | null;
  showBrandHighlights: boolean;
  description: string | null;
  showDescription: boolean;
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
