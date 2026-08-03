import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentEventEntity } from '../entities/shipment-event.entity';
import { ShipmentStatus } from '../enums/shipment-status.enum';

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
    case ShipmentStatus.PICKUP_PENDING:
      return 'Order Confirmed';
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

function buildFlowFromStepIndex(
  currentIndex: number,
  isDelivered: boolean,
  confirmedAt: Date | null,
  syncedAt: Date | null = null,
): ShipmentStatusFlowStep[] {
  return STATIC_FLOW_STEPS.map((step, index) => {
    let status: 'completed' | 'current' | 'pending' = 'pending';
    let happenedAt: Date | null = null;

    if (isDelivered || index < currentIndex) {
      status = 'completed';
      happenedAt = index === 0 ? confirmedAt : syncedAt ?? confirmedAt;
    } else if (index === currentIndex) {
      status = currentIndex === 0 ? 'completed' : 'current';
      happenedAt = index === 0 ? confirmedAt : syncedAt ?? confirmedAt;
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
  confirmedAt: Date | null,
  syncedAt: Date | null = null,
): ShipmentStatusFlowStep[] {
  if (orderStatus === OrderStatus.CANCELLED) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: confirmedAt,
      },
      {
        key: 'cancelled',
        label: 'Cancelled',
        status: 'completed',
        happenedAt: syncedAt ?? confirmedAt,
      },
    ];
  }

  if (orderStatus === OrderStatus.RTO || orderStatus === OrderStatus.FAILED_DELIVERY) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: confirmedAt,
      },
      {
        key: 'dispatched',
        label: 'Dispatched',
        status: 'completed',
        happenedAt: syncedAt ?? confirmedAt,
      },
      {
        key: orderStatus === OrderStatus.RTO ? 'rto' : 'failed_delivery',
        label: orderStatus === OrderStatus.RTO ? 'Returned to Origin' : 'Delivery Failed',
        status: 'completed',
        happenedAt: syncedAt ?? confirmedAt,
      },
    ];
  }

  const currentIndex = getOrderStepIndex(orderStatus);
  return buildFlowFromStepIndex(
    currentIndex,
    orderStatus === OrderStatus.DELIVERED,
    confirmedAt,
    syncedAt,
  );
}

function buildStatusFlow(shipment: ShipmentEntity): ShipmentStatusFlowStep[] {
  const currentStatus = shipment.shipmentStatus;
  const confirmedAt = shipment.pushedAt;
  const syncedAt = shipment.lastSyncedAt;

  if (currentStatus === ShipmentStatus.CANCELLED) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: confirmedAt,
      },
      {
        key: 'cancelled',
        label: 'Cancelled',
        status: 'completed',
        happenedAt: syncedAt,
      },
    ];
  }

  if (currentStatus === ShipmentStatus.RTO || currentStatus === ShipmentStatus.RTO_INITIATED) {
    return [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: confirmedAt,
      },
      {
        key: 'dispatched',
        label: 'Dispatched',
        status: 'completed',
        happenedAt: syncedAt ?? confirmedAt,
      },
      {
        key: 'rto',
        label: currentStatus === ShipmentStatus.RTO ? 'Returned to Origin' : 'RTO Initiated',
        status: 'completed',
        happenedAt: syncedAt,
      },
    ];
  }

  return buildFlowFromStepIndex(
    getCurrentStepIndex(currentStatus),
    currentStatus === ShipmentStatus.DELIVERED,
    confirmedAt,
    syncedAt,
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

export function mapDefaultShipmentResponse(order: {
  id: string;
  orderNumber: string;
  orderStatus: OrderStatus | string;
  createdAt?: Date | null;
}): ShipmentResponse {
  const confirmedAt = order.createdAt ?? null;
  const orderStatus = order.orderStatus;

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
    statusFlow: buildStatusFlowFromOrderStatus(orderStatus, confirmedAt),
  };
}

export function mapShipmentToResponse(
  shipment: ShipmentEntity,
  options: { shipwayStatus: boolean; orderStatus?: OrderStatus | string } = {
    shipwayStatus: false,
  },
): ShipmentResponse {
  const events = sortEvents(shipment.events ?? []);
  const mappedEvents = events.map(mapShipmentEventToResponse);
  const shipwayStatus = options.shipwayStatus;

  if (!shipwayStatus) {
    const orderStatus = options.orderStatus ?? OrderStatus.CONFIRMED;
    const confirmedAt = shipment.pushedAt ?? shipment.lastSyncedAt;

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
      statusFlow: buildStatusFlowFromOrderStatus(
        orderStatus,
        confirmedAt,
        shipment.lastSyncedAt,
      ),
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
    statusFlow: buildStatusFlow(shipment),
  };
}
