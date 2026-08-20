import { PaymentRequestStatus } from '../enums/payment-request-status.enum';

const PAYMENT_REQUEST_STATUS_RANK: Record<PaymentRequestStatus, number> = {
  [PaymentRequestStatus.PAYMENT_PENDING]: 0,
  [PaymentRequestStatus.LINK_GENERATED]: 1,
  [PaymentRequestStatus.CANCELLED]: 2,
  [PaymentRequestStatus.EXPIRED]: 2,
  [PaymentRequestStatus.PAID]: 3,
};

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
  return (
    (PAYMENT_REQUEST_STATUS_RANK[next] ?? 0) >= (PAYMENT_REQUEST_STATUS_RANK[current] ?? 0)
  );
}
