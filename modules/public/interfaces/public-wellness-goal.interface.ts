import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

/** One "Shop by Wellness Goals" card shown on the homepage. */
export interface IPublicWellnessGoalCard {
  refId: string;
  name: string;
  description?: string | null;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  imageAltText: string | null;
}

/** Active wellness goal for public view-all listing. */
export interface IPublicWellnessGoalListItem {
  refId: string;
  name: string;
  description: string | null;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  imageAltText: string | null;
}

/** Wellness goal metadata when product list is scoped by wellnessGoalRefId. */
export interface IPublicWellnessGoalProductListingContext {
  refId: string;
  name: string;
  /** HTML H1. Null means render `name` as plain text. */
  listingHeading: string | null;
  description: string | null;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  imageAltText: string | null;
  faqs: Array<{ question: string; answer: string; sequence: number }>;
  faqBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  faqBannerAltText: string | null;
}

