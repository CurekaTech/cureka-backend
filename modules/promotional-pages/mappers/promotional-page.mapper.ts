import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { mapCouponEntityToResponse } from '@modules/master/mappers/coupon.mapper';
import { IPromotionalCouponSummary } from '../interfaces/promotional-page.interface';

/**
 * Copy of an existing coupon for the landing page.
 * Amounts are informational. Cart checkout (`CouponCheckoutService`) decides eligibility.
 * The coupon model has no quantity tiers, so this does not invent "add one more" progress.
 */
export const mapCouponToPromotionalSummary = (
  coupon: CouponEntity | null | undefined,
): IPromotionalCouponSummary | null => {
  if (!coupon) return null;
  const mapped = mapCouponEntityToResponse(coupon);
  return {
    refId: mapped.refId,
    code: mapped.code,
    title: mapped.title,
    discountType: mapped.discountType,
    discountAmount: mapped.discountAmount,
    minPurchase: mapped.minPurchase,
    maxDiscount: mapped.maxDiscount,
    startDate: mapped.startDate,
    expiryDate: mapped.expiryDate,
    applicabilityScope: mapped.applicabilityScope,
    status: mapped.status,
    products: mapped.products,
    categories: mapped.categories,
    brands: mapped.brands,
  };
};
