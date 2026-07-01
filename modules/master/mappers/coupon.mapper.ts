import { CouponApplicabilityScope } from '../enums/coupon-applicability-scope.enum';
import { CouponEntity } from '../entities/coupon.entity';
import { ICoupon, ICouponRefSummary } from '../interfaces/coupon.interface';

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : parseFloat(value);
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : parseFloat(value);
};

export const mapCouponEntityToResponse = (entity: CouponEntity): ICoupon => ({
  id: entity.id,
  refId: entity.refId,
  couponType: entity.couponType,
  title: entity.title,
  code: entity.code,
  sameUserLimit: entity.sameUserLimit,
  discountType: entity.discountType,
  discountAmount: toNumber(entity.discountAmount),
  minPurchase: toNumber(entity.minPurchase),
  maxDiscount: toNullableNumber(entity.maxDiscount),
  startDate: entity.startDate,
  expiryDate: entity.expiryDate,
  applicabilityScope: entity.applicabilityScope ?? CouponApplicabilityScope.ALL,
  categories: mapCategorySummaries(entity),
  products: mapProductSummaries(entity),
  brands: mapBrandSummaries(entity),
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapCouponEntitiesToResponse = (entities: CouponEntity[]): ICoupon[] =>
  entities.map(mapCouponEntityToResponse);

const mapCategorySummaries = (entity: CouponEntity): ICouponRefSummary[] =>
  (entity.categoryMappings ?? [])
    .map((mapping) => ({
      refId: mapping.category?.refId ?? '',
      name: mapping.category?.name ?? '',
    }))
    .filter((item) => item.refId);

const mapProductSummaries = (entity: CouponEntity): ICouponRefSummary[] =>
  (entity.productMappings ?? [])
    .map((mapping) => ({
      refId: mapping.product?.refId ?? '',
      name: mapping.product?.name ?? '',
    }))
    .filter((item) => item.refId);

const mapBrandSummaries = (entity: CouponEntity): ICouponRefSummary[] =>
  (entity.brandMappings ?? [])
    .map((mapping) => ({
      refId: mapping.brand?.refId ?? '',
      name: mapping.brand?.name ?? '',
    }))
    .filter((item) => item.refId);
