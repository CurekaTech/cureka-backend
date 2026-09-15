import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

/** One "Brands We Trust" card shown on the homepage. */
export interface IPublicBrandCard {
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReference | IStorageFileReferenceResponse | null;
}

export interface IPublicBrandHighlight {
  icon: IStorageFileReference | IStorageFileReferenceResponse | null;
  title: string;
  subtitle: string;
}

/** Brand metadata returned when the product list is scoped by a single brandSlug/brandRefId. */
export interface IPublicBrandProductListingContext {
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  showBanner: boolean;
  video: IStorageFileReference | IStorageFileReferenceResponse | null;
  showVideo: boolean;
  featuredBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  showFeaturedBanner: boolean;
  promotionalBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  showPromotionalBanner: boolean;
  secondaryBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  showSecondaryBanner: boolean;
  secondaryVideo: IStorageFileReference | IStorageFileReferenceResponse | null;
  showSecondaryVideo: boolean;
  offerBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  showOfferBanner: boolean;
  faqBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  brandHighlights: IPublicBrandHighlight[] | null;
  showBrandHighlights: boolean;
  description: string | null;
  showDescription: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  faqs: Array<{ question: string; answer: string }>;
}
