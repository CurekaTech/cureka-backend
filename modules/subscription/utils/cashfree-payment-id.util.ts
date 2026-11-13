import { createHash } from 'crypto';

/**
 * Cashfree Subscriptions POST /pg/subscriptions/pay `payment_id`.
 * Official examples use hyphen/underscore alphanumerics (`PAY-123456`,
 * `test-payment-id`). Staging rejected colon-separated keys truncated at 50
 * chars (`sub:<uuid>:cycle:202`).
 */
export const CASHFREE_MERCHANT_PAYMENT_ID_MAX = 50;

const SAFE = /^[A-Za-z0-9_-]{1,50}$/;

export function cashfreeAutopayIdempotencyKey(
  subscriptionId: string,
  billingCycleRef: string,
): string {
  return `sub:${subscriptionId}:cycle:${billingCycleRef}:autopay`;
}

export function isValidCashfreeMerchantPaymentId(value: string): boolean {
  return SAFE.test(value);
}

/**
 * Stable merchant `payment_id` for one billing cycle. Same local idempotency
 * key always maps to the same token so retries do not create a second CHARGE.
 */
export function toCashfreeMerchantPaymentId(idempotencyKey: string): string {
  const trimmed = idempotencyKey.trim();
  if (SAFE.test(trimmed)) return trimmed;
  const hash = createHash('sha256').update(trimmed).digest('hex').slice(0, 40);
  return `p${hash}`;
}
