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
  video: IStorageFileReference | IStorageFileReferenceResponse | null;
  featuredBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  promotionalBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  secondaryBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  secondaryVideo: IStorageFileReference | IStorageFileReferenceResponse | null;
  brandHighlights: IPublicBrandHighlight[] | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
}
