import { IStorageFileReference } from '@packages/storage';

export interface IBlogHealthReadCard {
  refId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  categoryRefId: string;
  author: string | null;
  featuredImage: IStorageFileReference | null;
  tags: string[];
  publishedAt: Date | null;
  views: number;
}

export interface IBlogHealthReadsSection {
  posts: IBlogHealthReadCard[];
}
