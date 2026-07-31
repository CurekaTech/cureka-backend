import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

/** One "Shop by Wellness Goals" card shown on the homepage. */
export interface IPublicWellnessGoalCard {
  refId: string;
  name: string;
  description?: string | null;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
}
