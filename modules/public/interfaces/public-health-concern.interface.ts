import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

/**
 * One "Expert-Curated Wellness Bundles" card shown on the homepage, sourced from a
 * health concern flagged for the homepage. The health concern banner is intentionally
 * excluded here; only the icon image is exposed.
 */
export interface IPublicHealthConcernCard {
  refId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: IStorageFileReference | IStorageFileReferenceResponse | null;
}
