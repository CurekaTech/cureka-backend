import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

export interface IBestSellerIndexingCategory {
  refId: string;
  name: string;
  slug: string;
  bestsellerSortIndex: number | null;
  productCount: number;
}

export interface IBestSellerIndexingProduct {
  refId: string;
  name: string;
  slug: string;
  status: string;
  sortOrder: number;
  primaryImageUrl: IStorageFileReferenceResponse | IStorageFileReference | string | null;
}
