import { IStorageFileReferenceResponse } from '@packages/storage';

/** One "Brands We Trust" card shown on the homepage. */
export interface IPublicBrandCard {
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReferenceResponse | null;
}
