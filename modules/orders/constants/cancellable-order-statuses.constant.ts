import { OrderStatus } from '../enums/order-status.enum';

/** Order statuses that can be cancelled by the customer (before shipping). */
export const CANCELLABLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
];

export function isOrderCancellable(status: OrderStatus): boolean {
  return CANCELLABLE_ORDER_STATUSES.includes(status);
}
