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

  // Shipway short codes (also accepted by ShipwayStatusMapper)
  CODE_NFI = 'NFI', // Not Found/Incorrect / Status Pending
  CODE_SCH = 'SCH', // Shipment Booked
  CODE_INT = 'INT', // In Transit
  CODE_OOD = 'OOD', // Out for Delivery
  CODE_OFD = 'OFD', // Out for Delivery
  CODE_RAD = 'RAD', // Reached at Destination / Out for Delivery
  CODE_DEL = 'DEL', // Delivered
  CODE_PKP = 'PKP', // Picked Up
  CODE_PKF = 'PKF', // Pickup Failed
  CODE_RPF = 'RPF', // Pickup Failed (alt)
  CODE_CAN = 'CAN', // Cancelled
  CODE_RTO = 'RTO',
  CODE_UND = 'UND',

  // Fallback
  UNKNOWN = 'Unknown',
}
