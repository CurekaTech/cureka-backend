import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import { SubscriptionPriceResult } from '../services/product-subscription-pricing.service';

export const MANDATE_LIMIT_EXCEEDED_REASON = 'MANDATE_LIMIT_EXCEEDED';
export const PRODUCT_UNAVAILABLE_REASON = 'PRODUCT_UNAVAILABLE';

export type SubscriptionRenewalQuote = SubscriptionPriceResult & {
  unitSellingPrice: string;
  quantity: number;
  taxAmount: string;
  shippingAmount: string;
  sku: string | null;
  variantId: string;
  productId: string;
  calculatedAt: string;
};

export function isBillingCyclePricingLocked(status: SubscriptionBillingCycleStatus): boolean {
  return (
    status === SubscriptionBillingCycleStatus.DEBIT_PENDING ||
    status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT ||
    status === SubscriptionBillingCycleStatus.PAID ||
    status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
    status === SubscriptionBillingCycleStatus.SKIPPED
  );
}

export function buildRenewalPricingSnapshot(
  quote: SubscriptionRenewalQuote,
  extras?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    unitSellingPrice: quote.unitSellingPrice,
    quantity: quote.quantity,
    listAmount: quote.subscriptionPrice,
    discountAmount: quote.discountAmount,
    taxAmount: quote.taxAmount,
    shippingAmount: quote.shippingAmount,
    amount: quote.finalAmount,
    finalAmount: quote.finalAmount,
    sku: quote.sku,
    variantId: quote.variantId,
    productId: quote.productId,
    calculatedAt: quote.calculatedAt,
    ...extras,
  };
}
