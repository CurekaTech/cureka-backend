/**
 * Raw status strings returned by Shipway in API responses and webhooks.
 * These are intentionally exhaustive to cover all known Shipway statuses.
 */
export enum ShipwayStatus {
  // Pre-dispatch
  PENDING = 'Pending',
  CONFIRMED = 'Confirmed',
  PROCESSING = 'Processing',
  LABEL_GENERATED = 'Label Generated',
  PICKUP_PENDING = 'Pickup Pending',
  PICKUP_EXCEPTION = 'Pickup Exception',
  PICKUP_COMPLETE = 'Pickup Complete',

  // In-transit
  IN_TRANSIT = 'In Transit',
  OUT_FOR_DELIVERY = 'Out for Delivery',
  ATTEMPTED = 'Attempted',

  // Terminal — success
  DELIVERED = 'Delivered',

  // Terminal — failure / RTO
  FAILED_DELIVERY = 'Failed Delivery',
  UNDELIVERED = 'Undelivered',
  RTO_INITIATED = 'RTO Initiated',
  RTO_PICKED = 'RTO Picked',
  RTO_IN_TRANSIT = 'RTO In Transit',
  RTO = 'RTO',
  RTO_DELIVERED = 'RTO Delivered',

  // NDR
  NDR = 'NDR',
  NDR_ACTION_REQUIRED = 'NDR Action Required',

  // Cancellation
  CANCELLED = 'Cancelled',

  // Fallback
  UNKNOWN = 'Unknown',
}
