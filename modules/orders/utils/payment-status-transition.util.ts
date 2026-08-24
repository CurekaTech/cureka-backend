import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';

/**
 * Monotonic ranks for payment status. Higher = more advanced terminal progress.
 * Webhooks must not regress (e.g. PAID → PENDING/FAILED, REFUNDED → PAID).
 */
const PAYMENT_STATUS_RANK: Record<OrderPaymentStatus, number> = {
  [OrderPaymentStatus.PENDING]: 0,
  [OrderPaymentStatus.FAILED]: 1,
  [OrderPaymentStatus.PARTIALLY_PAID]: 2,
  [OrderPaymentStatus.PAID]: 3,
  [OrderPaymentStatus.REFUND_PENDING]: 4,
  [OrderPaymentStatus.PARTIALLY_REFUNDED]: 5,
  [OrderPaymentStatus.REFUNDED]: 6,
};

/** Order fulfillment progress — do not move CONFIRMED back to PENDING. */
const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  [OrderStatus.PENDING]: 0,
  [OrderStatus.PROCESSING]: 1,
  [OrderStatus.CONFIRMED]: 2,
  [OrderStatus.SHIPPED]: 3,
  [OrderStatus.OUT_FOR_DELIVERY]: 4,
  [OrderStatus.DELIVERED]: 5,
  [OrderStatus.FAILED_DELIVERY]: 5,
  [OrderStatus.RTO]: 5,
  [OrderStatus.CANCELLED]: 6,
};

export function getPaymentStatusRank(status: OrderPaymentStatus): number {
  return PAYMENT_STATUS_RANK[status] ?? 0;
}

export function getOrderStatusRank(status: OrderStatus): number {
  return ORDER_STATUS_RANK[status] ?? 0;
}

/**
 * Whether applying `next` payment status is allowed given current DB state.
 * Same status is allowed (idempotent). Regression is rejected.
 */
export function canTransitionPaymentStatus(
  current: OrderPaymentStatus,
  next: OrderPaymentStatus,
): boolean {
  if (current === next) {
    return true;
  }
  return getPaymentStatusRank(next) >= getPaymentStatusRank(current);
}

export function canTransitionOrderStatus(current: OrderStatus, next: OrderStatus): boolean {
  if (current === next) {
    return true;
  }
  // Cancelled / delivered terminals: only allow staying or moving to cancel from earlier.
  if (current === OrderStatus.CANCELLED) {
    return false;
  }
  if (
    current === OrderStatus.DELIVERED ||
    current === OrderStatus.RTO ||
    current === OrderStatus.FAILED_DELIVERY
  ) {
    return next === OrderStatus.CANCELLED ? false : getOrderStatusRank(next) >= getOrderStatusRank(current);
  }
  return getOrderStatusRank(next) >= getOrderStatusRank(current);
}

export function resolvePaymentStatusUpdate(
  current: OrderPaymentStatus,
  next: OrderPaymentStatus,
): { apply: boolean; status: OrderPaymentStatus; skipped: boolean } {
  if (!canTransitionPaymentStatus(current, next)) {
    return { apply: false, status: current, skipped: true };
  }
  if (current === next) {
    return { apply: false, status: current, skipped: true };
  }
  return { apply: true, status: next, skipped: false };
}

export function resolveOrderStatusUpdate(
  current: OrderStatus,
  next: OrderStatus,
): { apply: boolean; status: OrderStatus; skipped: boolean } {
  if (!canTransitionOrderStatus(current, next)) {
    return { apply: false, status: current, skipped: true };
  }
  if (current === next) {
    return { apply: false, status: current, skipped: true };
  }
  return { apply: true, status: next, skipped: false };
}
