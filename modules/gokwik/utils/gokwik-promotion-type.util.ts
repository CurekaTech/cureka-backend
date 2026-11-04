import { PromotionalPageType } from '@modules/promotional-pages/enums/promotional-page-type.enum';

/**
 * GoKwik Sync Product (`POST /v3/product/update-product-details`) ignores this
 * field. Collection coupons must use collection `product_ids` plus a product-level
 * sync. Kept only for historical payload tests.
 */
export const GOKWIK_PRODUCT_PROMOTION_TYPE_FIELD = 'promotionType';

export interface ResolvedGokwikPromotionType {
  /** Set only when every non-default association agrees on one type. */
  promotionType: PromotionalPageType | null;
  /** Distinct non-default types when they disagree. Nothing is chosen in that case. */
  conflict: PromotionalPageType[];
}

/**
 * Default and missing associations keep the existing product payload.
 * Several different non-default types are left unset instead of picking one.
 */
export function resolveGokwikPromotionType(
  promotionTypes: readonly PromotionalPageType[],
): ResolvedGokwikPromotionType {
  const nonDefault = [
    ...new Set(
      promotionTypes.filter(
        (promotionType) => promotionType && promotionType !== PromotionalPageType.DEFAULT,
      ),
    ),
  ].sort();

  if (nonDefault.length === 1) {
    return { promotionType: nonDefault[0] ?? null, conflict: [] };
  }

  if (nonDefault.length > 1) {
    return { promotionType: null, conflict: nonDefault };
  }

  return { promotionType: null, conflict: [] };
}
