import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentEventEntity } from '../entities/shipment-event.entity';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { HIDDEN_SHIPWAY_SCAN_STATUSES } from '../constants/shipway-status.constants';

export type ShipmentEventResponse = {
  status: string;
  description: string | null;
  location: string | null;
  happenedAt: Date | null;
};

export type ShipmentStatusFlowStep = {
  key: string;
  label: string;
  status: 'completed' | 'current' | 'pending';
  happenedAt: Date | null;
};

export type ShipmentResponse = {
  refId: string;
  orderId: string;
  orderNumber: string;
  shipmentStatus: string;
  shipwayStatus: boolean;
  shipwayRawStatus: string | null;
  awbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  invoiceUrl: string | null;
  pushedAt: Date | null;
  lastSyncedAt: Date | null;
  events: ShipmentEventResponse[];
  currentStatusLabel: string;
  statusFlow: ShipmentStatusFlowStep[];
};

/** Order columns preferred for per-step status-flow times. */
export type OrderStatusFlowTimestamps = {
  confirmedAt?: Date | null;
  processingAt?: Date | null;
  shippedAt?: Date | null;
  outForDeliveryAt?: Date | null;
  deliveredAt?: Date | null;
  cancelledAt?: Date | null;
  failedDeliveryAt?: Date | null;
  rtoAt?: Date | null;
  placedAt?: Date | null;
  createdAt?: Date | null;
};

const STATIC_FLOW_STEPS = [
  { key: 'confirmed', label: 'Order Confirmed' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
] as const;

function mapShipmentEventToResponse(event: ShipmentEventEntity): ShipmentEventResponse {
  return {
    status: event.status,
    description: event.description,
    location: event.location,
    happenedAt: event.happenedAt,
  };
}

function isHiddenScanEvent(event: ShipmentEventEntity): boolean {
  const status = (event.status ?? '').trim().toLowerCase();
  const description = (event.description ?? '').trim().toLowerCase();
  return HIDDEN_SHIPWAY_SCAN_STATUSES.has(status) || HIDDEN_SHIPWAY_SCAN_STATUSES.has(description);
}

function eventDedupeKey(event: ShipmentEventEntity): string {
  const happenedAt = event.happenedAt?.getTime() ?? 0;
  return [
    (event.status ?? '').trim().toLowerCase(),
    (event.location ?? '').trim().toLowerCase(),
    String(happenedAt),
    (event.description ?? '').trim().toLowerCase(),
  ].join('|');
}

function uniqueVisibleEvents(events: ShipmentEventEntity[]): ShipmentEventEntity[] {
  const seen = new Set<string>();
  const unique: ShipmentEventEntity[] = [];

  for (const event of sortEvents(events)) {
    if (isHiddenScanEvent(event)) continue;
    const key = eventDedupeKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }

  return unique;
}

function sortEvents(events: ShipmentEventEntity[]): ShipmentEventEntity[] {
  return [...events].sort((a, b) => {
    const aTime = a.happenedAt?.getTime() ?? 0;
    const bTime = b.happenedAt?.getTime() ?? 0;
    return bTime - aTime;
  });
}

function getFriendlyStatusLabel(status: string | ShipmentStatus): string {
  switch (status) {
    case ShipmentStatus.PENDING:
    case ShipmentStatus.CONFIRMED:
    case ShipmentStatus.PROCESSING:
      return 'Order Confirmed';
    case ShipmentStatus.PICKUP_PENDING:
      return 'Pickup Pending';
    case ShipmentStatus.PICKUP_COMPLETE:
    case ShipmentStatus.IN_TRANSIT:
      return 'Dispatched';
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return 'Out for Delivery';
    case ShipmentStatus.DELIVERED:
      return 'Delivered';
    case ShipmentStatus.CANCELLED:
      return 'Cancelled';
    case ShipmentStatus.FAILED_DELIVERY:
      return 'Delivery Failed';
    case ShipmentStatus.RTO_INITIATED:
      return 'RTO Initiated';
    case ShipmentStatus.RTO:
      return 'Returned to Origin';
    case ShipmentStatus.NDR:
      return 'Undelivered (NDR)';
    case ShipmentStatus.UNKNOWN:
    default:
      return 'Order Confirmed';
  }
}

function getFriendlyOrderStatusLabel(orderStatus: OrderStatus | string): string {
  switch (orderStatus) {
    case OrderStatus.PENDING:
    case OrderStatus.CONFIRMED:
    case OrderStatus.PROCESSING:
      return 'Order Confirmed';
    case OrderStatus.SHIPPED:
      return 'Dispatched';
    case OrderStatus.OUT_FOR_DELIVERY:
      return 'Out for Delivery';
    case OrderStatus.DELIVERED:
      return 'Delivered';
    case OrderStatus.CANCELLED:
      return 'Cancelled';
    case OrderStatus.FAILED_DELIVERY:
      return 'Delivery Failed';
    case OrderStatus.RTO:
      return 'Returned to Origin';
    default:
      return 'Order Confirmed';
  }
}

/** Index of the "current" step in STATIC_FLOW_STEPS from shipment status. */
function getCurrentStepIndex(status: string | ShipmentStatus): number {
  switch (status) {
    case ShipmentStatus.PENDING:
    case ShipmentStatus.CONFIRMED:
    case ShipmentStatus.PROCESSING:
    case ShipmentStatus.PICKUP_PENDING:
    case ShipmentStatus.UNKNOWN:
      return 0;
    case ShipmentStatus.PICKUP_COMPLETE:
    case ShipmentStatus.IN_TRANSIT:
      return 1;
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return 2;
    case ShipmentStatus.DELIVERED:
      return 3;
    default:
      return 0;
  }
}

/** Index of the "current" step from Cureka order status (used when Shipway is unavailable). */
function getOrderStepIndex(orderStatus: OrderStatus | string): number {
  switch (orderStatus) {
    case OrderStatus.PENDING:
    case OrderStatus.CONFIRMED:
    case OrderStatus.PROCESSING:
      return 0;
    case OrderStatus.SHIPPED:
      return 1;
    case OrderStatus.OUT_FOR_DELIVERY:
      return 2;
    case OrderStatus.DELIVERED:
      return 3;
    default:
      return 0;
  }
}

function earliestMatchingEvent(
  events: ShipmentEventEntity[],
  matchers: Array<(status: string, description: string) => boolean>,
): Date | null {
  let earliest: Date | null = null;
  for (const event of events) {
    const status = (event.status ?? '').trim().toLowerCase();
    const description = (event.description ?? '').trim().toLowerCase();
    if (!matchers.some((match) => match(status, description))) continue;
    if (!event.happenedAt) continue;
    if (!earliest || event.happenedAt.getTime() < earliest.getTime()) {
      earliest = event.happenedAt;
    }
  }
  return earliest;
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

type ResolvedFlowTimes = {
  confirmedAt: Date | null;
  shippedAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  failedDeliveryAt: Date | null;
  rtoAt: Date | null;
};

/**
 * Prefer order timestamp columns, then matching shipment_events.happened_at.
 * Avoids reusing a single syncedAt for every step.
 */
function resolveFlowTimes(
  orderTimestamps: OrderStatusFlowTimestamps | undefined,
  events: ShipmentEventEntity[],
  fallbackConfirmed: Date | null,
): ResolvedFlowTimes {
  const confirmedAt =
    orderTimestamps?.confirmedAt ??
    orderTimestamps?.processingAt ??
    orderTimestamps?.placedAt ??
    orderTimestamps?.createdAt ??
    fallbackConfirmed;

  const shippedAt =
    orderTimestamps?.shippedAt ??
    earliestMatchingEvent(events, [
      (s, d) =>
        ['pkp', 'rpkp', 'int', 'picked up', 'in transit', 'pickup complete', 'shipment picked up'].includes(
          s,
        ) ||
        includesAny(s, ['picked up', 'in transit']) ||
        includesAny(d, ['picked up', 'in transit']),
    ]);

  const outForDeliveryAt =
    orderTimestamps?.outForDeliveryAt ??
    earliestMatchingEvent(events, [
      (s, d) =>
        ['ood', 'ofd', 'rad', 'out for delivery'].includes(s) ||
        includesAny(s, ['out for delivery']) ||
        includesAny(d, ['out for delivery']),
    ]);

  const deliveredAt =
    orderTimestamps?.deliveredAt ??
    earliestMatchingEvent(events, [
      (s, d) => s === 'del' || s === 'delivered' || includesAny(d, ['delivered']),
    ]);

  const cancelledAt =
    orderTimestamps?.cancelledAt ??
    earliestMatchingEvent(events, [
      (s, d) =>
        ['can', 'pcan', 'cancelled', 'canceled'].includes(s) ||
        includesAny(d, ['cancel']),
    ]);

  const failedDeliveryAt =
    orderTimestamps?.failedDeliveryAt ??
    earliestMatchingEvent(events, [
      (s, d) =>
        ['und', 'dex', 'cna', 'ndr', 'failed delivery'].includes(s) ||
        includesAny(s, ['undeliver', 'failed']) ||
        includesAny(d, ['undeliver', 'failed delivery']),
    ]);

  const rtoAt =
    orderTimestamps?.rtoAt ??
    earliestMatchingEvent(events, [
      (s, d) =>
        ['rto', 'rtd', 'rdel', 'rint'].includes(s) ||
        includesAny(s, ['rto', 'return']) ||
        includesAny(d, ['rto', 'return to origin']),
    ]);

  return {
    confirmedAt: confirmedAt ?? null,
    shippedAt: shippedAt ?? null,
    outForDeliveryAt: outForDeliveryAt ?? null,
    deliveredAt: deliveredAt ?? null,
    cancelledAt: cancelledAt ?? null,
    failedDeliveryAt: failedDeliveryAt ?? null,
    rtoAt: rtoAt ?? null,
  };
}

function stepTimeForIndex(index: number, times: ResolvedFlowTimes): Date | null {
  switch (index) {
    case 0:
      return times.confirmedAt;
    case 1:
      return times.shippedAt;
    case 2:
      return times.outForDeliveryAt;
    case 3:
      return times.deliveredAt;
    default:
      return null;
  }
}

function buildFlowFromStepIndex(
  currentIndex: number,
  isDelivered: boolean,
  times: ResolvedFlowTimes,
): ShipmentStatusFlowStep[] {
  return STATIC_FLOW_STEPS.map((step, index) => {
    let status: 'completed' | 'current' | 'pending' = 'pending';
    let happenedAt: Date | null = null;

    if (isDelivered || index < currentIndex) {
      status = 'completed';
      happenedAt = stepTimeForIndex(index, times);
    } else if (index === currentIndex) {
      status = currentIndex === 0 ? 'completed' : 'current';
      happenedAt = stepTimeForIndex(index, times);
    }

    return {
      key: step.key,
      label: step.label,
      status,
      happenedAt,
    };
  });
}

/**
 * Default 4-step flow driven by Cureka order status when Shipway has no usable status.
 */
function buildStatusFlowFromOrderStatus(
  orderStatus: OrderStatus | string,
  times: ResolvedFlowTimes,
): ShipmentStatusFlowStep[] {
  if (orderStatus === OrderStatus.CANCELLED) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: times.confirmedAt,
      },
      {
        key: 'cancelled',
        label: 'Cancelled',
        status: 'completed',
        happenedAt: times.cancelledAt ?? times.confirmedAt,
      },
    ];
  }

  if (orderStatus === OrderStatus.RTO || orderStatus === OrderStatus.FAILED_DELIVERY) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: times.confirmedAt,
      },
      {
        key: 'dispatched',
        label: 'Dispatched',
        status: 'completed',
        happenedAt: times.shippedAt ?? times.confirmedAt,
      },
      {
        key: orderStatus === OrderStatus.RTO ? 'rto' : 'failed_delivery',
        label: orderStatus === OrderStatus.RTO ? 'Returned to Origin' : 'Delivery Failed',
        status: 'completed',
        happenedAt:
          orderStatus === OrderStatus.RTO
            ? times.rtoAt ?? times.shippedAt
            : times.failedDeliveryAt ?? times.shippedAt,
      },
    ];
  }

  const currentIndex = getOrderStepIndex(orderStatus);
  return buildFlowFromStepIndex(
    currentIndex,
    orderStatus === OrderStatus.DELIVERED,
    times,
  );
}

function buildStatusFlow(
  shipment: ShipmentEntity,
  orderTimestamps?: OrderStatusFlowTimestamps,
): ShipmentStatusFlowStep[] {
  const currentStatus = shipment.shipmentStatus;
  const events = uniqueVisibleEvents(shipment.events ?? []);
  const times = resolveFlowTimes(
    orderTimestamps,
    events,
    shipment.pushedAt ?? shipment.lastSyncedAt ?? null,
  );

  if (currentStatus === ShipmentStatus.CANCELLED) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: times.confirmedAt,
      },
      {
        key: 'cancelled',
        label: 'Cancelled',
        status: 'completed',
        happenedAt: times.cancelledAt ?? times.confirmedAt,
      },
    ];
  }

  if (currentStatus === ShipmentStatus.RTO || currentStatus === ShipmentStatus.RTO_INITIATED) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: times.confirmedAt,
      },
      {
        key: 'dispatched',
        label: 'Dispatched',
        status: 'completed',
        happenedAt: times.shippedAt ?? times.confirmedAt,
      },
      {
        key: 'rto',
        label: currentStatus === ShipmentStatus.RTO ? 'Returned to Origin' : 'RTO Initiated',
        status: 'completed',
        happenedAt: times.rtoAt ?? times.shippedAt,
      },
    ];
  }

  if (currentStatus === ShipmentStatus.FAILED_DELIVERY || currentStatus === ShipmentStatus.NDR) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: times.confirmedAt,
      },
      {
        key: 'dispatched',
        label: 'Dispatched',
        status: 'completed',
        happenedAt: times.shippedAt ?? times.confirmedAt,
      },
      {
        key: 'failed_delivery',
        label: 'Delivery Failed',
        status: 'completed',
        happenedAt: times.failedDeliveryAt ?? times.shippedAt,
      },
    ];
  }

  return buildFlowFromStepIndex(
    getCurrentStepIndex(currentStatus),
    currentStatus === ShipmentStatus.DELIVERED,
    times,
  );
}

function orderStatusToShipmentStatus(orderStatus: OrderStatus | string): ShipmentStatus {
  switch (orderStatus) {
    case OrderStatus.PENDING:
      return ShipmentStatus.PENDING;
    case OrderStatus.CONFIRMED:
      return ShipmentStatus.CONFIRMED;
    case OrderStatus.PROCESSING:
      return ShipmentStatus.PROCESSING;
    case OrderStatus.SHIPPED:
      return ShipmentStatus.IN_TRANSIT;
    case OrderStatus.OUT_FOR_DELIVERY:
      return ShipmentStatus.OUT_FOR_DELIVERY;
    case OrderStatus.DELIVERED:
      return ShipmentStatus.DELIVERED;
    case OrderStatus.CANCELLED:
      return ShipmentStatus.CANCELLED;
    case OrderStatus.FAILED_DELIVERY:
      return ShipmentStatus.FAILED_DELIVERY;
    case OrderStatus.RTO:
      return ShipmentStatus.RTO;
    default:
      return ShipmentStatus.CONFIRMED;
  }
}

function pickOrderTimestamps(
  order: OrderStatusFlowTimestamps & Record<string, unknown>,
): OrderStatusFlowTimestamps {
  return {
    confirmedAt: (order.confirmedAt as Date | null | undefined) ?? null,
    processingAt: (order.processingAt as Date | null | undefined) ?? null,
    shippedAt: (order.shippedAt as Date | null | undefined) ?? null,
    outForDeliveryAt: (order.outForDeliveryAt as Date | null | undefined) ?? null,
    deliveredAt: (order.deliveredAt as Date | null | undefined) ?? null,
    cancelledAt: (order.cancelledAt as Date | null | undefined) ?? null,
    failedDeliveryAt: (order.failedDeliveryAt as Date | null | undefined) ?? null,
    rtoAt: (order.rtoAt as Date | null | undefined) ?? null,
    placedAt: (order.placedAt as Date | null | undefined) ?? null,
    createdAt: (order.createdAt as Date | null | undefined) ?? null,
  };
}

export function mapDefaultShipmentResponse(
  order: {
    id: string;
    orderNumber: string;
    orderStatus: OrderStatus | string;
  } & OrderStatusFlowTimestamps,
): ShipmentResponse {
  const orderStatus = order.orderStatus;
  const timestamps = pickOrderTimestamps(order);
  const times = resolveFlowTimes(timestamps, [], timestamps.createdAt ?? null);

  return {
    refId: '',
    orderId: order.id,
    orderNumber: order.orderNumber,
    shipmentStatus: orderStatusToShipmentStatus(orderStatus),
    shipwayStatus: false,
    shipwayRawStatus: null,
    awbNumber: null,
    courierName: null,
    trackingUrl: null,
    labelUrl: null,
    invoiceUrl: null,
    pushedAt: null,
    lastSyncedAt: null,
    events: [],
    currentStatusLabel: getFriendlyOrderStatusLabel(orderStatus),
    statusFlow: buildStatusFlowFromOrderStatus(orderStatus, times),
  };
}

export function mapShipmentToResponse(
  shipment: ShipmentEntity,
  options: {
    shipwayStatus: boolean;
    orderStatus?: OrderStatus | string;
    orderTimestamps?: OrderStatusFlowTimestamps;
  } = {
    shipwayStatus: false,
  },
): ShipmentResponse {
  const events = uniqueVisibleEvents(shipment.events ?? []);
  const mappedEvents = events.map(mapShipmentEventToResponse);
  const shipwayStatus = options.shipwayStatus;
  const orderTimestamps = options.orderTimestamps;

  if (!shipwayStatus) {
    const orderStatus = options.orderStatus ?? OrderStatus.CONFIRMED;
    const times = resolveFlowTimes(
      orderTimestamps,
      events,
      shipment.pushedAt ?? shipment.lastSyncedAt ?? orderTimestamps?.createdAt ?? null,
    );

    return {
      refId: shipment.refId,
      orderId: shipment.orderId,
      orderNumber: shipment.orderNumber,
      shipmentStatus: orderStatusToShipmentStatus(orderStatus),
      shipwayStatus: false,
      shipwayRawStatus: shipment.shipwayRawStatus,
      awbNumber: shipment.awbNumber,
      courierName: shipment.courierName,
      trackingUrl: shipment.trackingUrl,
      labelUrl: shipment.labelUrl,
      invoiceUrl: shipment.invoiceUrl,
      pushedAt: shipment.pushedAt,
      lastSyncedAt: shipment.lastSyncedAt,
      events: mappedEvents,
      currentStatusLabel: getFriendlyOrderStatusLabel(orderStatus),
      statusFlow: buildStatusFlowFromOrderStatus(orderStatus, times),
    };
  }

  return {
    refId: shipment.refId,
    orderId: shipment.orderId,
    orderNumber: shipment.orderNumber,
    shipmentStatus: shipment.shipmentStatus,
    shipwayStatus: true,
    shipwayRawStatus: shipment.shipwayRawStatus,
    awbNumber: shipment.awbNumber,
    courierName: shipment.courierName,
    trackingUrl: shipment.trackingUrl,
    labelUrl: shipment.labelUrl,
    invoiceUrl: shipment.invoiceUrl,
    pushedAt: shipment.pushedAt,
    lastSyncedAt: shipment.lastSyncedAt,
    events: mappedEvents,
    currentStatusLabel: getFriendlyStatusLabel(shipment.shipmentStatus),
    statusFlow: buildStatusFlow(shipment, orderTimestamps),
  };
}
