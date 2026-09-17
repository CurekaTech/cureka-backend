import { CancellationStatus } from '../enums/cancellation-status.enum';
import { CancellationSyncStatus } from '../enums/cancellation-sync-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { isOrderCancellable } from '../constants/cancellable-order-statuses.constant';
import { OrderEntity } from '../entities/order.entity';
import { OrderFulfillmentEventEntity } from '../entities/order-fulfillment-event.entity';

export type OrderActionRestriction = {
  canCancel: boolean;
  cancelBlockedReason: string | null;
  canReturn: boolean;
  returnBlockedReason: string | null;
  canWithdrawReturn: boolean;
};

export type OrderCancellationView = {
  status: CancellationStatus;
  unicommerceStatus: CancellationSyncStatus;
  shipwayStatus: CancellationSyncStatus;
  reason: string | null;
  requestedAt: Date | null;
  lastAttemptAt: Date | null;
  attemptCount: number;
  lastError: string | null;
};

export type OrderFulfillmentEventView = {
  id: string;
  requestType: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  message: string | null;
  actorType: string;
  createdAt: Date;
  isCustomerVisible: boolean;
  metadata: Record<string, unknown> | null;
};

export function mapCancellationView(
  order: Pick<
    OrderEntity,
    | 'cancellationStatus'
    | 'cancellationUnicommerceStatus'
    | 'cancellationShipwayStatus'
    | 'cancelReason'
    | 'cancellationRequestedAt'
    | 'cancellationLastAttemptAt'
    | 'cancellationAttemptCount'
    | 'cancellationSyncError'
  >,
): OrderCancellationView {
  return {
    status: order.cancellationStatus ?? CancellationStatus.NONE,
    unicommerceStatus: order.cancellationUnicommerceStatus ?? CancellationSyncStatus.NOT_STARTED,
    shipwayStatus: order.cancellationShipwayStatus ?? CancellationSyncStatus.NOT_STARTED,
    reason: order.cancelReason ?? null,
    requestedAt: order.cancellationRequestedAt ?? null,
    lastAttemptAt: order.cancellationLastAttemptAt ?? null,
    attemptCount: order.cancellationAttemptCount ?? 0,
    lastError: order.cancellationSyncError ?? null,
  };
}

export function mapFulfillmentEvent(
  event: OrderFulfillmentEventEntity,
  includeInternal: boolean,
): OrderFulfillmentEventView | null {
  if (!includeInternal && !event.isCustomerVisible) {
    return null;
  }
  return {
    id: event.id,
    requestType: event.requestType,
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    message: event.message,
    actorType: event.actorType,
    createdAt: event.createdAt,
    isCustomerVisible: event.isCustomerVisible,
    metadata: includeInternal ? event.metadata : null,
  };
}

export function resolveOrderActions(params: {
  order: Pick<OrderEntity, 'orderStatus' | 'cancellationStatus'>;
  hasEligibleReturnItems: boolean | null;
  hasWithdrawableReturn: boolean;
}): OrderActionRestriction {
  const { order, hasEligibleReturnItems, hasWithdrawableReturn } = params;
  const cancellationStatus = order.cancellationStatus ?? CancellationStatus.NONE;

  let canCancel = isOrderCancellable(order.orderStatus);
  let cancelBlockedReason: string | null = null;

  if (order.orderStatus === OrderStatus.CANCELLED) {
    canCancel = false;
    cancelBlockedReason = 'This order is already cancelled';
  } else if (cancellationStatus === CancellationStatus.PROCESSING) {
    canCancel = false;
    cancelBlockedReason = 'A cancellation request is already being processed';
  } else if (cancellationStatus === CancellationStatus.CONFIRMED) {
    canCancel = false;
    cancelBlockedReason = 'Cancellation is already confirmed';
  } else if (cancellationStatus === CancellationStatus.REQUIRES_ATTENTION) {
    canCancel = false;
    cancelBlockedReason =
      'Cancellation needs operations review because an external fulfilment step is unresolved';
  } else if (cancellationStatus === CancellationStatus.REJECTED) {
    canCancel = false;
    cancelBlockedReason = 'Cancellation was rejected because the order has already been dispatched';
  } else if (!canCancel) {
    cancelBlockedReason = 'Orders can only be cancelled before shipping';
  }

  let canReturn = hasEligibleReturnItems === true;
  let returnBlockedReason: string | null = null;
  if (hasEligibleReturnItems === false) {
    returnBlockedReason = 'No returnable items remain on this order';
  } else if (hasEligibleReturnItems === null && order.orderStatus !== OrderStatus.DELIVERED) {
    canReturn = false;
    returnBlockedReason = 'Returns are available after the order is delivered';
  } else if (hasEligibleReturnItems === null) {
    canReturn = true;
  }

  return {
    canCancel,
    cancelBlockedReason,
    canReturn,
    returnBlockedReason,
    canWithdrawReturn: hasWithdrawableReturn,
  };
}
