import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';

/** Deterministic identity matching cart duplicate logic: variant + subscription + frequency. */
export function buildSavedForLaterIdentityKey(
  variantId: string,
  isSubscription: boolean,
  frequency: ProductSubscriptionFrequency | null,
): string {
  return `${variantId}:${isSubscription ? '1' : '0'}:${frequency ?? ''}`;
}
