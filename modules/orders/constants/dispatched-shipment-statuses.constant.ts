import { ShipmentStatus } from '@modules/shipping/enums/shipment-status.enum';

/** Courier already has, or has had, the parcel — too late for pre-dispatch cancel. */
export const DISPATCHED_SHIPMENT_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  ShipmentStatus.PICKUP_COMPLETE,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
  ShipmentStatus.FAILED_DELIVERY,
  ShipmentStatus.RTO_INITIATED,
  ShipmentStatus.RTO,
  ShipmentStatus.NDR,
]);

export function isShipmentDispatched(status: ShipmentStatus | null | undefined): boolean {
  if (!status) return false;
  return DISPATCHED_SHIPMENT_STATUSES.has(status);
}
