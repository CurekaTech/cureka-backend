import { GatewayChargeState } from '../interfaces/subscription-mandate-provider.interface';

/** Razorpay live UPI debits 25 hours after the pre-debit notification. Five minutes covers clock skew. */
export const RAZORPAY_UPI_LIVE_PREDEBIT_MS = (25 * 60 + 5) * 60 * 1000;

/** Test-key window only. Live keys never use this, including 5-minute tenures. */
export const RAZORPAY_UPI_TEST_PREDEBIT_MS = 2 * 60 * 1000;

export type RazorpaySettlementDecision = 'paid' | 'ignore' | 'verify';

/**
 * Live UPI always waits out Razorpay's pre-debit window.
 * A short window is only for an rzp_test_ key while TechBV test tenures are on.
 */
export function razorpayUpiPaymentAfter(params: {
  now: Date;
  keyId: string;
  allowShortWindow: boolean;
}): Date {
  const testKey = params.keyId.trim().startsWith('rzp_test_');
  const delayMs =
    testKey && params.allowShortWindow ? RAZORPAY_UPI_TEST_PREDEBIT_MS : RAZORPAY_UPI_LIVE_PREDEBIT_MS;
  return new Date(params.now.getTime() + delayMs);
}

/**
 * Debit at the subscription's next charge when that time already satisfies
 * Razorpay's pre-debit window. Otherwise wait out the minimum window.
 * A 27-hour tenure sent immediately therefore collects at 27 hours, not 25 hours
 * after the cycle becomes due.
 */
export function razorpayUpiDebitAt(params: {
  now: Date;
  keyId: string;
  allowShortWindow: boolean;
  scheduledAt?: Date | null;
}): Date {
  const earliest = razorpayUpiPaymentAfter(params);
  if (params.scheduledAt && params.scheduledAt.getTime() >= earliest.getTime()) {
    return params.scheduledAt;
  }
  return earliest;
}

/**
 * payment.authorized never settles a subscription. order.paid and payment.captured
 * settle only when the payment status is captured. A missing status must be fetched.
 */
export function razorpaySubscriptionEventSettlesPayment(
  event: string,
  paymentStatus?: string | null,
): RazorpaySettlementDecision {
  if (event === 'payment.authorized') return 'ignore';
  const status = paymentStatus?.trim().toLowerCase();
  if (event === 'payment.captured') {
    if (!status) return 'verify';
    return status === 'captured' ? 'paid' : 'ignore';
  }
  if (event === 'order.paid') {
    if (status === 'captured') return 'paid';
    if (status) return 'ignore';
    return 'verify';
  }
  return 'ignore';
}

export function classifyRazorpayPaymentStatus(status: string | null | undefined): GatewayChargeState {
  const value = (status ?? '').trim().toLowerCase();
  if (value === 'captured') return 'captured';
  if (value === 'failed') return 'failed';
  if (value === 'created' || value === 'authorized' || value === 'pending') return 'pending';
  return 'unknown';
}
