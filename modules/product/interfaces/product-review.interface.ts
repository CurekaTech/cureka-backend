import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { ProductReviewStatus } from '../enums/product-review-status.enum';

export interface IProductReview {
  id: string;
  refId: string;
  productId: string;
  productRefId: string;
  productName: string | null;
  productImage: IStorageFileReference | IStorageFileReferenceResponse | string | null;
  userId: string | null;
  variantId: string | null;
  variantSku: string | null;
  customerName: string;
  rating: number;
  review: string | null;
  reviewDescription: string | null;
  customerAge: string | null;
  customerLocation: string | null;
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
  review: string | null;
  reviewDescription: string | null;
  customerAge: string | null;
  customerLocation: string | null;
  variantId: string | null;
  createdAt: Date;
}

export type PublicProductReviewScope = 'variant' | 'product';

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
  /** `variant` when the summary and list are that variant's approved reviews. */
  scope: PublicProductReviewScope;
  /** Set only when `scope` is `variant`. */
  variantId: string | null;
}

/** Signed-in shopper's existing review for a product (any status). */
export interface IMyProductReviewSnapshot {
  refId: string;
  rating: number;
  review: string | null;
  reviewDescription: string | null;
  status: ProductReviewStatus;
  variantId: string | null;
}

export interface IProductReviewEligibility {
  /** True when the shopper may create a new review (ordered + none yet). */
  canReview: boolean;
  /** Present when this shopper already has a review for the product. */
  existingReview: IMyProductReviewSnapshot | null;
}
