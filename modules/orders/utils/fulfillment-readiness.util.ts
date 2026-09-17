import { OrderEntity } from '../entities/order.entity';
import { CancellationStatus } from '../enums/cancellation-status.enum';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';

const TERMINAL_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELLED,
  OrderStatus.DELIVERED,
  OrderStatus.RTO,
  OrderStatus.FAILED_DELIVERY,
]);

const PAID_READY_STATUSES = new Set<OrderPaymentStatus>([
  OrderPaymentStatus.PAID,
  OrderPaymentStatus.PARTIALLY_PAID,
]);

function isCodLike(paymentMethod: OrderPaymentMethod): boolean {
  return (
    paymentMethod === OrderPaymentMethod.COD ||
    paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD
  );
}

/**
 * UniCommerce prepaid gate (mirrors Shipway intent, but also allows PARTIALLY_PAID).
 * COD / partial-COD may push without full prepaid capture.
 */
const CANCELLATION_BLOCKS_EXPORT = new Set<CancellationStatus>([
  CancellationStatus.REQUESTED,
  CancellationStatus.PROCESSING,
  CancellationStatus.CONFIRMED,
  CancellationStatus.REQUIRES_ATTENTION,
  CancellationStatus.REJECTED,
  CancellationStatus.HISTORICAL_UNVERIFIED,
]);

export function isCancellationBlockingExport(
  status: CancellationStatus | string | null | undefined,
): boolean {
  if (!status) return false;
  return CANCELLATION_BLOCKS_EXPORT.has(status as CancellationStatus);
}

export function isReadyForUnicommercePush(
  order: Pick<OrderEntity, 'orderStatus' | 'paymentStatus' | 'paymentMethod'> & {
    cancellationStatus?: CancellationStatus | string | null;
  },
): boolean {
  if (isCancellationBlockingExport(order.cancellationStatus)) {
    return false;
  }
  if (TERMINAL_ORDER_STATUSES.has(order.orderStatus)) {
    return false;
  }

  if (isCodLike(order.paymentMethod)) {
    // Draft unpaid create must not push; placed COD is CONFIRMED with payment still PENDING.
    return order.orderStatus !== OrderStatus.PENDING;
  }

  return (
    PAID_READY_STATUSES.has(order.paymentStatus) && order.orderStatus !== OrderStatus.PENDING
  );
}
