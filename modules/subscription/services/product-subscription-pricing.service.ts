import { Injectable } from '@nestjs/common';
import { SubscriptionDiscountType } from '../enums/subscription-discount-type.enum';

export type SubscriptionPriceResult = {
  subscriptionPrice: string;
  discountAmount: string;
  finalAmount: string;
};

@Injectable()
export class ProductSubscriptionPricingService {
  /**
   * Server-side pricing only — never trust frontend amounts.
   * Base = variantSellingPrice * qty; apply subscription discount; then optional member discount.
   */
  calculate(
    variantSellingPrice: string | number,
    quantity: number,
    discountType: SubscriptionDiscountType,
    discountValue: string | number,
    memberDiscount?: { valueType: 'PERCENTAGE' | 'FLAT'; value: string | number } | null,
  ): SubscriptionPriceResult {
    const unit = Number(variantSellingPrice);
    const qty = Math.max(1, Number(quantity) || 1);
    const base = round2(unit * qty);

    let afterSubDiscount = applyDiscount(base, discountType, Number(discountValue));
    const subscriptionDiscountAmount = round2(base - afterSubDiscount);

    let final = afterSubDiscount;
    if (memberDiscount && memberDiscount.value != null) {
      const memberType =
        memberDiscount.valueType === 'FLAT'
          ? SubscriptionDiscountType.FLAT
          : SubscriptionDiscountType.PERCENTAGE;
      final = applyDiscount(afterSubDiscount, memberType, Number(memberDiscount.value));
    }

    return {
      subscriptionPrice: toDecimal(base),
      discountAmount: toDecimal(subscriptionDiscountAmount),
      finalAmount: toDecimal(Math.max(0, final)),
    };
  }
}

function applyDiscount(
  amount: number,
  type: SubscriptionDiscountType,
  value: number,
): number {
  if (!value || value <= 0) return amount;
  if (type === SubscriptionDiscountType.PERCENTAGE) {
    return round2(amount - (amount * Math.min(value, 100)) / 100);
  }
  return round2(Math.max(0, amount - value));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toDecimal(n: number): string {
  return n.toFixed(2);
}
