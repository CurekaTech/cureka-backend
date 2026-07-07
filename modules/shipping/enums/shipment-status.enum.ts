/**
 * Internal shipment statuses used in the Cureka database.
 * These are mapped FROM raw Shipway statuses via ShipwayStatusMapper.
 */
export enum ShipmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  PICKUP_PENDING = 'PICKUP_PENDING',
  PICKUP_COMPLETE = 'PICKUP_COMPLETE',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FAILED_DELIVERY = 'FAILED_DELIVERY',
  RTO_INITIATED = 'RTO_INITIATED',
  RTO = 'RTO',
  NDR = 'NDR',
  UNKNOWN = 'UNKNOWN',
}
