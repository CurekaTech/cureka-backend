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
      return 'Order Placed';
    case ShipmentStatus.CONFIRMED:
      return 'Order Confirmed';
    case ShipmentStatus.PROCESSING:
    case ShipmentStatus.PICKUP_PENDING:
      return 'Ready to Pack';
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

function buildStatusFlow(shipment: ShipmentEntity, sortedEvents: ShipmentEventResponse[]): ShipmentStatusFlowStep[] {
  let confirmedDate = shipment.pushedAt;
  let processingDate: Date | null = null;
  let dispatchedDate: Date | null = null;
  let outForDeliveryDate: Date | null = null;
  let deliveredDate: Date | null = null;
  let cancelledDate: Date | null = null;
  let rtoDate: Date | null = null;

  for (const event of sortedEvents) {
    if (!event.happenedAt) continue;
    const lowerStatus = event.status.toLowerCase();
    const eventTime = event.happenedAt;

    if (lowerStatus === 'pending' || lowerStatus === 'confirmed') {
      if (!confirmedDate || eventTime.getTime() < confirmedDate.getTime()) {
        confirmedDate = eventTime;
      }
    }
    if (
      lowerStatus === 'processing' ||
      lowerStatus === 'label generated' ||
      lowerStatus === 'pickup pending' ||
      lowerStatus === 'pickup exception'
    ) {
      if (!processingDate || eventTime.getTime() < processingDate.getTime()) {
        processingDate = eventTime;
      }
    }
    if (lowerStatus === 'pickup complete' || lowerStatus === 'in transit') {
      if (!dispatchedDate || eventTime.getTime() < dispatchedDate.getTime()) {
        dispatchedDate = eventTime;
      }
    }
    if (lowerStatus === 'out for delivery') {
      if (!outForDeliveryDate || eventTime.getTime() < outForDeliveryDate.getTime()) {
        outForDeliveryDate = eventTime;
      }
    }
    if (lowerStatus === 'delivered') {
      if (!deliveredDate || eventTime.getTime() < deliveredDate.getTime()) {
        deliveredDate = eventTime;
      }
    }
    if (lowerStatus === 'cancelled') {
      if (!cancelledDate || eventTime.getTime() < cancelledDate.getTime()) {
        cancelledDate = eventTime;
      }
    }
    if (
      lowerStatus.includes('rto') ||
      lowerStatus === 'undelivered' ||
      lowerStatus === 'failed delivery'
    ) {
      if (!rtoDate || eventTime.getTime() < rtoDate.getTime()) {
        rtoDate = eventTime;
      }
    }
  }

  const currentStatus = shipment.shipmentStatus;

  if (
    !processingDate &&
    [
      ShipmentStatus.PROCESSING,
      ShipmentStatus.PICKUP_PENDING,
      ShipmentStatus.PICKUP_COMPLETE,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
      ShipmentStatus.DELIVERED,
      ShipmentStatus.RTO_INITIATED,
      ShipmentStatus.RTO,
    ].includes(currentStatus as ShipmentStatus)
  ) {
    processingDate = shipment.pushedAt;
  }

  if (
    !dispatchedDate &&
    [
      ShipmentStatus.PICKUP_COMPLETE,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
      ShipmentStatus.DELIVERED,
      ShipmentStatus.RTO_INITIATED,
      ShipmentStatus.RTO,
    ].includes(currentStatus as ShipmentStatus)
  ) {
    dispatchedDate = shipment.lastSyncedAt;
  }

  if (
    !outForDeliveryDate &&
    [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED].includes(
      currentStatus as ShipmentStatus,
    )
  ) {
    outForDeliveryDate = shipment.lastSyncedAt;
  }

  if (!deliveredDate && currentStatus === ShipmentStatus.DELIVERED) {
    deliveredDate = shipment.lastSyncedAt;
  }

  if (!cancelledDate && currentStatus === ShipmentStatus.CANCELLED) {
    cancelledDate = shipment.lastSyncedAt;
  }

  if (
    !rtoDate &&
    [ShipmentStatus.RTO_INITIATED, ShipmentStatus.RTO].includes(currentStatus as ShipmentStatus)
  ) {
    rtoDate = shipment.lastSyncedAt;
  }

  if (currentStatus === ShipmentStatus.CANCELLED) {
    const steps: ShipmentStatusFlowStep[] = [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: confirmedDate,
      },
    ];

    if (processingDate) {
      steps.push({
        key: 'processing',
        label: 'Ready to Pack',
        status: 'completed',
        happenedAt: processingDate,
      });
    }
    if (dispatchedDate) {
      steps.push({
        key: 'dispatched',
        label: 'Dispatched',
        status: 'completed',
        happenedAt: dispatchedDate,
      });
    }

    steps.push({
      key: 'cancelled',
      label: 'Cancelled',
      status: 'completed',
      happenedAt: cancelledDate || shipment.lastSyncedAt,
    });

    return steps;
  }

  if (currentStatus === ShipmentStatus.RTO || currentStatus === ShipmentStatus.RTO_INITIATED) {
    const steps: ShipmentStatusFlowStep[] = [
      {
        key: 'confirmed',
        label: 'Order Confirmed',
        status: 'completed',
        happenedAt: confirmedDate,
      },
      {
        key: 'processing',
        label: 'Ready to Pack',
        status: 'completed',
        happenedAt: processingDate || confirmedDate,
      },
      {
        key: 'dispatched',
        label: 'Dispatched',
        status: 'completed',
        happenedAt: dispatchedDate || confirmedDate,
      },
      {
        key: 'rto',
        label: currentStatus === ShipmentStatus.RTO ? 'Returned to Origin' : 'RTO Initiated',
        status: 'completed',
        happenedAt: rtoDate || shipment.lastSyncedAt,
      },
    ];
    return steps;
  }

  const steps: ShipmentStatusFlowStep[] = [];

  steps.push({
    key: 'confirmed',
    label: 'Order Confirmed',
    status: 'completed',
    happenedAt: confirmedDate,
  });

  let processingStatus: 'completed' | 'current' | 'pending' = 'pending';
  if (
    [ShipmentStatus.PROCESSING, ShipmentStatus.PICKUP_PENDING].includes(
      currentStatus as ShipmentStatus,
    )
  ) {
    processingStatus = 'current';
  } else if (
    [
      ShipmentStatus.PICKUP_COMPLETE,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
      ShipmentStatus.DELIVERED,
    ].includes(currentStatus as ShipmentStatus)
  ) {
    processingStatus = 'completed';
  }
  steps.push({
    key: 'processing',
    label: 'Ready to Pack',
    status: processingStatus,
    happenedAt: processingStatus !== 'pending' ? (processingDate || confirmedDate) : null,
  });

  let dispatchedStatus: 'completed' | 'current' | 'pending' = 'pending';
  if (
    [ShipmentStatus.PICKUP_COMPLETE, ShipmentStatus.IN_TRANSIT].includes(
      currentStatus as ShipmentStatus,
    )
  ) {
    dispatchedStatus = 'current';
  } else if (
    [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED].includes(
      currentStatus as ShipmentStatus,
    )
  ) {
    dispatchedStatus = 'completed';
  }
  steps.push({
    key: 'dispatched',
    label: 'Dispatched',
    status: dispatchedStatus,
    happenedAt: dispatchedStatus !== 'pending' ? (dispatchedDate || processingDate || confirmedDate) : null,
  });

  let outForDeliveryStatus: 'completed' | 'current' | 'pending' = 'pending';
  if (currentStatus === ShipmentStatus.OUT_FOR_DELIVERY) {
    outForDeliveryStatus = 'current';
  } else if (currentStatus === ShipmentStatus.DELIVERED) {
    outForDeliveryStatus = 'completed';
  }
  steps.push({
    key: 'out_for_delivery',
    label: 'Out for Delivery',
    status: outForDeliveryStatus,
    happenedAt: outForDeliveryStatus !== 'pending' ? (outForDeliveryDate || dispatchedDate || confirmedDate) : null,
  });

  let deliveredStatus: 'completed' | 'current' | 'pending' = 'pending';
  if (currentStatus === ShipmentStatus.DELIVERED) {
    deliveredStatus = 'completed';
  }
  steps.push({
    key: 'delivered',
    label: 'Delivered',
    status: deliveredStatus,
    happenedAt: deliveredStatus !== 'pending' ? (deliveredDate || outForDeliveryDate || confirmedDate) : null,
  });

  return steps;
}

export function mapShipmentToResponse(shipment: ShipmentEntity): ShipmentResponse {
  const events = sortEvents(shipment.events ?? []);
  const mappedEvents = events.map(mapShipmentEventToResponse);

  return {
    refId: shipment.refId,
    orderId: shipment.orderId,
    orderNumber: shipment.orderNumber,
    shipmentStatus: shipment.shipmentStatus,
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
    statusFlow: buildStatusFlow(shipment, mappedEvents),
  };
}
