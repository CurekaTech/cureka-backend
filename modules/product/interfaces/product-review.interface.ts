import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { ProductReviewStatus } from '../enums/product-review-status.enum';

export interface IProductReview {
  id: string;
  refId: string;
  productId: string;
  productRefId: string;
  productName: string | null;
  productImage: IStorageFileReference | IStorageFileReferenceResponse | string | null;
  userId: string;
  customerName: string;
  rating: number;
  review: string;
  status: ProductReviewStatus;
  moderatedBy: string | null;
  moderatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPublicProductReviewItem {
  refId: string;
  customerName: string;
  rating: number;
  review: string;
  createdAt: Date;
}

export interface IProductReviewRatingBreakdown {
  rating: number;
  percent: number;
}

export interface IPublicProductReviewSummary {
  averageRating: number;
  ratingsCount: number;
  reviewsCount: number;
  breakdown: IProductReviewRatingBreakdown[];
}

export interface IPublicProductReviewsResponse {
  summary: IPublicProductReviewSummary;
  reviews: IPublicProductReviewItem[];
}
