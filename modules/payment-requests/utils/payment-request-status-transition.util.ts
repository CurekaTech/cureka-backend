import { PaymentRequestStatus } from '../enums/payment-request-status.enum';

const PAYMENT_REQUEST_STATUS_RANK: Record<PaymentRequestStatus, number> = {
  [PaymentRequestStatus.PAYMENT_PENDING]: 0,
  [PaymentRequestStatus.LINK_GENERATED]: 1,
  [PaymentRequestStatus.FAILED]: 2,
  [PaymentRequestStatus.CANCELLED]: 2,
  [PaymentRequestStatus.EXPIRED]: 2,
  [PaymentRequestStatus.PAID]: 3,
};

/** Terminal statuses that may still recover to PAID (or regenerate a link after FAILED). */
const RECOVERABLE_FROM_FAILED = new Set<PaymentRequestStatus>([
  PaymentRequestStatus.LINK_GENERATED,
  PaymentRequestStatus.PAID,
  PaymentRequestStatus.CANCELLED,
  PaymentRequestStatus.EXPIRED,
]);

export function canTransitionPaymentRequestStatus(
  current: PaymentRequestStatus,
  next: PaymentRequestStatus,
): boolean {
  if (current === next) {
    return true;
  }
  if (current === PaymentRequestStatus.PAID) {
    return false;
  }
  if (current === PaymentRequestStatus.FAILED) {
    return RECOVERABLE_FROM_FAILED.has(next);
  }
  return (
    (PAYMENT_REQUEST_STATUS_RANK[next] ?? 0) >= (PAYMENT_REQUEST_STATUS_RANK[current] ?? 0)
  );
}
