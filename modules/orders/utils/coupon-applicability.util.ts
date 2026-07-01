import { CouponApplicabilityScope } from '@modules/master/enums/coupon-applicability-scope.enum';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { CartLineItem } from '../interfaces/cart-pricing.interface';

export type CouponEligibleCartItem = CartLineItem & {
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  brandId: string | null;
};

export const getProductCategoryIds = (item: CouponEligibleCartItem): string[] =>
  [
    item.categoryId,
    item.subCategoryId,
    item.subSubCategoryId,
    item.subSubSubCategoryId,
  ].filter((value): value is string => Boolean(value));

export const isCartItemEligibleForCoupon = (
  coupon: CouponEntity,
  item: CouponEligibleCartItem,
): boolean => {
  switch (coupon.applicabilityScope) {
    case CouponApplicabilityScope.ALL:
      return true;
    case CouponApplicabilityScope.CATEGORIES: {
      const allowedCategoryIds = (coupon.categoryMappings ?? []).map(
        (mapping) => mapping.categoryId,
      );
      if (!allowedCategoryIds.length) {
        return Boolean(item.categoryId);
      }
      const allowedSet = new Set(allowedCategoryIds);
      return getProductCategoryIds(item).some((categoryId) => allowedSet.has(categoryId));
    }
    case CouponApplicabilityScope.PRODUCTS: {
      const allowedProductIds = (coupon.productMappings ?? []).map(
        (mapping) => mapping.productId,
      );
      if (!allowedProductIds.length) {
        return true;
      }
      return new Set(allowedProductIds).has(item.productId);
    }
    case CouponApplicabilityScope.BRANDS: {
      const allowedBrandIds = (coupon.brandMappings ?? []).map((mapping) => mapping.brandId);
      if (!allowedBrandIds.length) {
        return Boolean(item.brandId);
      }
      if (!item.brandId) return false;
      return new Set(allowedBrandIds).has(item.brandId);
    }
    default:
      return false;
  }
};

export const calculateEligibleSubtotal = (
  coupon: CouponEntity,
  items: CouponEligibleCartItem[],
): number => {
  return items
    .filter((item) => isCartItemEligibleForCoupon(coupon, item))
    .reduce((sum, item) => sum + item.totalPrice, 0);
};
