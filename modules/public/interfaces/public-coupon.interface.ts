import { CouponApplicabilityScope } from '@modules/master/enums/coupon-applicability-scope.enum';
import { CouponDiscountType } from '@modules/master/enums/coupon-discount-type.enum';

export interface IPublicCouponRefSummary {
  refId: string;
  name: string;
}

export interface IPublicCoupon {
  refId: string;
  couponType: string;
  title: string;
  code: string;
  sameUserLimit: number | null;
  discountType: CouponDiscountType;
  discountAmount: number;
  minPurchase: number;
  maxDiscount: number | null;
  startDate: Date;
  expiryDate: Date;
  applicabilityScope: CouponApplicabilityScope;
  categories: IPublicCouponRefSummary[];
  products: IPublicCouponRefSummary[];
  brands: IPublicCouponRefSummary[];
}
