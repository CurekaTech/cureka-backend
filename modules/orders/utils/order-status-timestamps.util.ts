import { OrderEntity } from '../entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';

export type OrderStatusTimestampFields = Pick<
  OrderEntity,
  | 'confirmedAt'
  | 'processingAt'
  | 'shippedAt'
  | 'outForDeliveryAt'
  | 'deliveredAt'
  | 'cancelledAt'
  | 'failedDeliveryAt'
  | 'rtoAt'
>;

export type OrderStatusTimestampPatch = Partial<OrderStatusTimestampFields>;

const STATUS_TIMESTAMP_FIELD: Partial<Record<OrderStatus, keyof OrderStatusTimestampFields>> = {
  [OrderStatus.CONFIRMED]: 'confirmedAt',
  [OrderStatus.PROCESSING]: 'processingAt',
  [OrderStatus.SHIPPED]: 'shippedAt',
  [OrderStatus.OUT_FOR_DELIVERY]: 'outForDeliveryAt',
  [OrderStatus.DELIVERED]: 'deliveredAt',
  [OrderStatus.CANCELLED]: 'cancelledAt',
  [OrderStatus.FAILED_DELIVERY]: 'failedDeliveryAt',
  [OrderStatus.RTO]: 'rtoAt',
};

/**
 * Returns timestamp columns to set for `nextStatus` when that column is still null.
 * Never overwrites an existing status time (set-once).
 */
export function applyOrderStatusTimestamps(
  order: Pick<OrderEntity, keyof OrderStatusTimestampFields>,
  nextStatus: OrderStatus,
  occurredAt: Date = new Date(),
): OrderStatusTimestampPatch {
  const field = STATUS_TIMESTAMP_FIELD[nextStatus];
  if (!field) {
    return {};
  }

  if (order[field] != null) {
    return {};
  }

  const at =
    occurredAt instanceof Date && !Number.isNaN(occurredAt.getTime())
      ? occurredAt
      : new Date();

  return { [field]: at };
}

export function resolveOccurredAt(value: Date | string | null | undefined): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

export const EMPTY_ORDER_STATUS_TIMESTAMPS: OrderStatusTimestampFields = {
  confirmedAt: null,
  processingAt: null,
  shippedAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
  cancelledAt: null,
  failedDeliveryAt: null,
  rtoAt: null,
};
