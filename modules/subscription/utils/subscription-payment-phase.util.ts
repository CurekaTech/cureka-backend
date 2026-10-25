import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';

export type SubscriptionPaymentPhase =
  | 'AWAITING_AUTHORIZATION'
  | 'PRODUCT_PROCESSING'
  | 'PRODUCT_CONFIRMED'
  | 'PRODUCT_FAILED'
  | 'RECONCILING';

export type SubscriptionPaymentPhaseResult = {
  phase: SubscriptionPaymentPhase;
  orderId: string | null;
  retryAllowed: boolean;
};

const PENDING_SUBSCRIPTION = new Set<ProductSubscriptionStatus>([
  ProductSubscriptionStatus.PENDING_PAYMENT,
  ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
  ProductSubscriptionStatus.PAST_DUE,
]);

/**
 * Customer-facing view of payment rows that already exist.
 * Mandate confirmation and a captured registration amount do not count as a paid product charge.
 */
export function resolveSubscriptionPaymentPhase(input: {
  status: ProductSubscriptionStatus;
  autopayReady: boolean;
  firstOrderId?: string | null;
  payments: Array<{
    status: SubscriptionPaymentStatus | string;
    orderId?: string | null;
    gatewayPaymentId?: string | null;
  }>;
}): SubscriptionPaymentPhaseResult {
  const payments = input.payments ?? [];
  const pendingSubscription = PENDING_SUBSCRIPTION.has(input.status);
  if (payments.some((payment) => payment.status === SubscriptionPaymentStatus.RECONCILING)) {
    return { phase: 'RECONCILING', orderId: null, retryAllowed: false };
  }
  const latest = payments[0];
  if (latest?.status === SubscriptionPaymentStatus.FAILED && pendingSubscription) {
    return { phase: 'PRODUCT_FAILED', orderId: null, retryAllowed: true };
  }
  const paid = payments.find((payment) => payment.status === SubscriptionPaymentStatus.PAID);
  if ((paid || input.firstOrderId) && !pendingSubscription) {
    return {
      phase: 'PRODUCT_CONFIRMED',
      orderId: paid?.orderId ?? input.firstOrderId ?? null,
      retryAllowed: false,
    };
  }
  if (input.autopayReady && pendingSubscription) {
    return { phase: 'PRODUCT_PROCESSING', orderId: null, retryAllowed: false };
  }
  const chargeOpen = payments.some(
    (payment) =>
      payment.status === SubscriptionPaymentStatus.PENDING ||
      (payment.status === SubscriptionPaymentStatus.LINK_GENERATED && Boolean(payment.gatewayPaymentId)),
  );
  if (chargeOpen) {
    return { phase: 'RECONCILING', orderId: null, retryAllowed: false };
  }
  return {
    phase: 'AWAITING_AUTHORIZATION',
    orderId: null,
    retryAllowed: pendingSubscription,
  };
}
