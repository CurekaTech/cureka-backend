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

/**
 * Active health concerns flagged for the homepage (`inHomePage`), ordered by `sortIndex`.
 */
export interface IPublicHomePageHealthConcern {
  refId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  /** Homepage display order. Lower = first; null = unordered (sorted after indexed items). */
  sortIndex: number | null;
}
