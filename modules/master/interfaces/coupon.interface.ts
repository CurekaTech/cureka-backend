import { CouponApplicabilityScope } from '../enums/coupon-applicability-scope.enum';
import { CouponDiscountType } from '../enums/coupon-discount-type.enum';
import { MasterStatus } from '../enums/master-status.enum';

export interface ICouponRefSummary {
  refId: string;
  name: string;
}

export interface ICoupon {
  id: string;
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
  categories: ICouponRefSummary[];
  products: ICouponRefSummary[];
  brands: ICouponRefSummary[];
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
