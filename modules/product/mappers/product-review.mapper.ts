import { ProductReviewEntity } from '../entities/product-review.entity';
import {
  IProductReview,
  IPublicProductReviewItem,
} from '../interfaces/product-review.interface';

export const mapProductReviewEntityToAdmin = (
  entity: ProductReviewEntity,
  extras?: {
    productName?: string | null;
    productImage?: IProductReview['productImage'];
  },
): IProductReview => ({
  id: entity.id,
  refId: entity.refId,
  productId: entity.productId,
  productRefId: entity.productRefId,
  productName: extras?.productName ?? entity.product?.name ?? null,
  productImage: extras?.productImage ?? null,
  userId: entity.userId,
  customerName: entity.customerName,
  rating: entity.rating,
  review: entity.review,
  status: entity.status,
  moderatedBy: entity.moderatedBy,
  moderatedAt: entity.moderatedAt,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const mapProductReviewEntityToPublic = (
  entity: ProductReviewEntity,
): IPublicProductReviewItem => ({
  refId: entity.refId,
  customerName: entity.customerName,
  rating: entity.rating,
  review: entity.review,
  createdAt: entity.createdAt,
});
