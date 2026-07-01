import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { mapCouponEntityToResponse } from '@modules/master/mappers/coupon.mapper';
import { IPublicCoupon } from '../interfaces/public-coupon.interface';

export const mapCouponEntityToPublic = (entity: CouponEntity): IPublicCoupon => {
  const coupon = mapCouponEntityToResponse(entity);

  return {
    refId: coupon.refId,
    couponType: coupon.couponType,
    title: coupon.title,
    code: coupon.code,
    sameUserLimit: coupon.sameUserLimit,
    discountType: coupon.discountType,
    discountAmount: coupon.discountAmount,
    minPurchase: coupon.minPurchase,
    maxDiscount: coupon.maxDiscount,
    startDate: coupon.startDate,
    expiryDate: coupon.expiryDate,
    applicabilityScope: coupon.applicabilityScope,
    categories: coupon.categories,
    products: coupon.products,
    brands: coupon.brands,
  };
};

export const mapCouponEntitiesToPublic = (entities: CouponEntity[]): IPublicCoupon[] =>
  entities.map(mapCouponEntityToPublic);
