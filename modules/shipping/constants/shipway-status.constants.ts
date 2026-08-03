import { ShipmentStatus } from '../enums/shipment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';

/**
 * Canonical mapping from raw Shipway status strings / codes → internal ShipmentStatus.
 *
 * Shipway returns either human labels ("In Transit") or short codes ("INT", "NFI").
 * Both forms are listed here. Lookup is done after normalizeShipwayStatusKey().
 */
export const SHIPWAY_TO_SHIPMENT_STATUS_MAP: Record<string, ShipmentStatus> = {
  // Pre-dispatch — labels
  Pending: ShipmentStatus.PENDING,
  Confirmed: ShipmentStatus.CONFIRMED,
  Processing: ShipmentStatus.PROCESSING,
  'Label Generated': ShipmentStatus.PROCESSING,
  'Pickup Pending': ShipmentStatus.PICKUP_PENDING,
  'Pickup Exception': ShipmentStatus.PICKUP_PENDING,
  'Pickup Complete': ShipmentStatus.PICKUP_COMPLETE,
  'Shipment Booked': ShipmentStatus.PROCESSING,
  'Picked Up': ShipmentStatus.PICKUP_COMPLETE,
  'Status Pending': ShipmentStatus.PENDING,
  'Not Found/Incorrect': ShipmentStatus.PENDING,
  'Not Found': ShipmentStatus.PENDING,

  // Pre-dispatch — codes (Shipway current_status_code)
  SCH: ShipmentStatus.PROCESSING, // Shipment Booked
  PKP: ShipmentStatus.PICKUP_COMPLETE, // Picked Up
  NFI: ShipmentStatus.PENDING, // Not Found/Incorrect / Status Pending (AWB not scanning yet)
  RSCH: ShipmentStatus.PICKUP_PENDING, // Pickup Scheduled
  ROOP: ShipmentStatus.PICKUP_PENDING, // Out for Pickup
  RPKP: ShipmentStatus.PICKUP_COMPLETE, // Shipment Picked Up
  PCAN: ShipmentStatus.CANCELLED, // Pickup Cancelled
  RPF: ShipmentStatus.PICKUP_PENDING, // Pickup Failed

  // In-transit — labels
  'In Transit': ShipmentStatus.IN_TRANSIT,
  'Out for Delivery': ShipmentStatus.OUT_FOR_DELIVERY,
  Attempted: ShipmentStatus.FAILED_DELIVERY,
  'On Hold': ShipmentStatus.PROCESSING,
  'Network Issue': ShipmentStatus.IN_TRANSIT,
  'Delivery Next Day': ShipmentStatus.IN_TRANSIT,
  'Out of Delivery Area': ShipmentStatus.FAILED_DELIVERY,
  Others: ShipmentStatus.IN_TRANSIT,
  'Delivery Delayed': ShipmentStatus.IN_TRANSIT,
  'Address Incorrect': ShipmentStatus.FAILED_DELIVERY,
  'Delivery Attempted': ShipmentStatus.FAILED_DELIVERY,
  'Pending - Undelivered': ShipmentStatus.FAILED_DELIVERY,
  'Delivery Attempted-Premises Closed': ShipmentStatus.FAILED_DELIVERY,
  'Customer Refused': ShipmentStatus.FAILED_DELIVERY,
  'Consignee Unavailable': ShipmentStatus.FAILED_DELIVERY,
  'Delivery Exception': ShipmentStatus.FAILED_DELIVERY,
  'Delivery Rescheduled': ShipmentStatus.IN_TRANSIT,
  'COD Payment Not Ready': ShipmentStatus.FAILED_DELIVERY,
  Lost: ShipmentStatus.FAILED_DELIVERY,

  // In-transit — codes
  INT: ShipmentStatus.IN_TRANSIT,
  OOD: ShipmentStatus.OUT_FOR_DELIVERY,
  ONH: ShipmentStatus.PROCESSING,
  NWI: ShipmentStatus.IN_TRANSIT,
  DNB: ShipmentStatus.IN_TRANSIT,
  ODA: ShipmentStatus.FAILED_DELIVERY,
  OTH: ShipmentStatus.IN_TRANSIT,
  SMD: ShipmentStatus.IN_TRANSIT,
  CRTA: ShipmentStatus.FAILED_DELIVERY,
  CNA: ShipmentStatus.FAILED_DELIVERY,
  DEX: ShipmentStatus.FAILED_DELIVERY,
  DRE: ShipmentStatus.IN_TRANSIT,
  PNR: ShipmentStatus.FAILED_DELIVERY,
  LOST: ShipmentStatus.FAILED_DELIVERY,

  // Terminal — success
  Delivered: ShipmentStatus.DELIVERED,
  DEL: ShipmentStatus.DELIVERED,

  // Terminal — failure / RTO
  'Failed Delivery': ShipmentStatus.FAILED_DELIVERY,
  Undelivered: ShipmentStatus.FAILED_DELIVERY,
  'RTO Initiated': ShipmentStatus.RTO_INITIATED,
  'RTO Picked': ShipmentStatus.RTO_INITIATED,
  'RTO In Transit': ShipmentStatus.RTO_INITIATED,
  RTO: ShipmentStatus.RTO,
  'RTO Delivered': ShipmentStatus.RTO,
  UND: ShipmentStatus.FAILED_DELIVERY,
  RTD: ShipmentStatus.RTO,
  RINT: ShipmentStatus.RTO_INITIATED,
  RDEL: ShipmentStatus.RTO,

  // NDR
  NDR: ShipmentStatus.NDR,
  'NDR Action Required': ShipmentStatus.NDR,

  // Cancellation
  Cancelled: ShipmentStatus.CANCELLED,
  CAN: ShipmentStatus.CANCELLED,
};

/**
 * Maps internal ShipmentStatus → OrderStatus for syncing the orders table.
 *
 * Only transitions that affect the customer-visible order status are included.
 * NDR and pickup sub-states don't change the order status (they stay at PROCESSING).
 */
export const SHIPMENT_TO_ORDER_STATUS_MAP: Partial<Record<ShipmentStatus, OrderStatus>> = {
  [ShipmentStatus.PENDING]: OrderStatus.CONFIRMED,
  [ShipmentStatus.CONFIRMED]: OrderStatus.CONFIRMED,
  [ShipmentStatus.PROCESSING]: OrderStatus.PROCESSING,
  [ShipmentStatus.PICKUP_PENDING]: OrderStatus.PROCESSING,
  [ShipmentStatus.PICKUP_COMPLETE]: OrderStatus.PROCESSING,
  [ShipmentStatus.IN_TRANSIT]: OrderStatus.SHIPPED,
  [ShipmentStatus.OUT_FOR_DELIVERY]: OrderStatus.OUT_FOR_DELIVERY,
  [ShipmentStatus.DELIVERED]: OrderStatus.DELIVERED,
  [ShipmentStatus.CANCELLED]: OrderStatus.CANCELLED,
  [ShipmentStatus.FAILED_DELIVERY]: OrderStatus.FAILED_DELIVERY,
  [ShipmentStatus.RTO_INITIATED]: OrderStatus.RTO,
  [ShipmentStatus.RTO]: OrderStatus.RTO,
  // NDR does not change order status — stays SHIPPED or PROCESSING
};

/** Normalize Shipway status for map lookup (trim + case-insensitive for codes). */
export function normalizeShipwayStatusKey(shipwayStatus: string): string {
  const trimmed = shipwayStatus.trim();
  if (!trimmed) return trimmed;

  const upper = trimmed.toUpperCase();
  // Short codes are case-insensitive (NFI, nfi, Int → INT)
  if (/^[A-Z0-9]{2,5}$/i.test(trimmed)) {
    return upper;
  }

  // Title-case common labels for exact map keys
  const lower = trimmed.toLowerCase();
  const titleCased = lower.replace(/\b\w/g, (c) => c.toUpperCase());
  return titleCased;
}
