import { WebsiteExperienceReviewEntity } from '../entities/website-experience-review.entity';
import { IWebsiteExperienceReview } from '../interfaces/website-experience-review.interface';

export function mapWebsiteExperienceReview(
  entity: WebsiteExperienceReviewEntity,
): IWebsiteExperienceReview {
  return {
    id: entity.id,
    refId: entity.refId,
    orderId: entity.orderId,
    orderNumber: entity.orderNumber,
    userId: entity.userId,
    customerName: entity.customerName,
    customerEmail: entity.customerEmail,
    rating: entity.rating,
    feedback: entity.feedback,
    createdAt: entity.createdAt,
  };
}
