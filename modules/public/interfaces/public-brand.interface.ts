import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

/** One "Brands We Trust" card shown on the homepage. */
export interface IPublicBrandCard {
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReference | IStorageFileReferenceResponse | null;
}

/** Brand metadata returned when the product list is scoped by a single brandSlug/brandRefId. */
export interface IPublicBrandProductListingContext {
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
}
