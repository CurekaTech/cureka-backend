import { MasterStatus } from '../enums/master-status.enum';
import {
  IStorageFileReference,
  IStorageFileReferenceResponse,
} from '@packages/storage';

export interface IBrandHighlight {
  icon: IStorageFileReferenceResponse | IStorageFileReference | null;
  iconAltText?: string | null;
  title: string;
  subtitle: string;
}

export interface IBrand {
  id: string;
  refId: string;
  name: string;
  skuCode: string;
  slug: string;
  logo: IStorageFileReferenceResponse | null;
  logoAltText: string | null;
  banner: IStorageFileReferenceResponse | null;
  bannerAltText: string | null;
  showBanner: boolean;
  video: IStorageFileReferenceResponse | null;
  showVideo: boolean;
  featuredBanner: IStorageFileReferenceResponse | null;
  featuredBannerAltText: string | null;
  showFeaturedBanner: boolean;
  promotionalBanner: IStorageFileReferenceResponse | null;
  promotionalBannerAltText: string | null;
  showPromotionalBanner: boolean;
  secondaryBanner: IStorageFileReferenceResponse | null;
  secondaryBannerAltText: string | null;
  showSecondaryBanner: boolean;
  secondaryVideo: IStorageFileReferenceResponse | null;
  showSecondaryVideo: boolean;
  offerBanner: IStorageFileReferenceResponse | null;
  offerBannerAltText: string | null;
  showOfferBanner: boolean;
  faqBanner: IStorageFileReferenceResponse | null;
  faqBannerAltText: string | null;
  brandHighlights: IBrandHighlight[] | null;
  showBrandHighlights: boolean;
  description: string | null;
  listingHeading: string | null;
  showDescription: boolean;
  status: MasterStatus;
  inHomePage: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  faqs: Array<{ question: string; answer: string; sequence: number }>;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
