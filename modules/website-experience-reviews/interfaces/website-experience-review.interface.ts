export interface IWebsiteExperienceReview {
  id: string;
  refId: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string | null;
  rating: number;
  feedback: string | null;
  createdAt: Date;
}

export interface IWebsiteExperienceReviewEligibility {
  canReview: boolean;
  submitted: boolean;
  existingReview: IWebsiteExperienceReview | null;
}
