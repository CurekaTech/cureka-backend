/**
 * Native-checkout preservation rules.
 *
 * The open commercial questions stay configurable per offer where the schema
 * already has a field (reward price, tier group, threshold amount). The bases
 * that would change existing coupon, fee, and prepaid math stay on today's
 * inputs so a cart with no offer matches the current checkout exactly.
 *
 * These are the only bases phase 2 is allowed to apply. They are not a
 * commercial approval that stacking or fee treatment should stay this way.
 */
export const PROMOTIONAL_OFFERS_SETTING_KEY = 'PROMOTIONAL_OFFERS_ENABLED';

export interface PromotionSnapshot {
  promotions: Array<{
    id: string;
    name: string;
    offerType: string;
    customerMessage: string;
    discountAmount: number;
  }>;
  warnings: Array<{ code: string; message: string }>;
  bmsmDiscount: number;
  rewardCharged: number;
  promotionDiscount?: number;
}

export const PROMOTION_PRICING_RULES = {
  couponBase: 'customerSubtotal',
  feeAndCodBase: 'customerSubtotalMinusCoupon',
  prepaidBase: 'customerLineTotalPrice',
  giftThresholdBase: 'customerSubtotal',
  partialReward: 'grant-none',
  bmsmAggregation: 'tierGroupQuantitySum',
  bmsmTierSelection: 'highestMinQuantity',
} as const;
