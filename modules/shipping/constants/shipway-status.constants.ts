import { ShipmentStatus } from '../enums/shipment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';

/**
 * Official Shipway `current_status_code` table
 * (API Version 3.1.2 — getOrderShipmentDetails).
 *
 * Docs: current_status_code is the status. `current_status` is a courier
 * narrative (e.g. "Shipment Delivered received By: Self at 1300"), not the code.
 *
 * Scan history lives in `response.scan[]`: `{ time, location, status_detail }`.
 *
 * Extra OMS codes (RSCH, ROOP, RPKP, PCAN, RPF, RINT, RDEL, RAD, OFD, PKF)
 * are used by app.shipway.com and are mapped here as well.
 */
export const SHIPWAY_TO_SHIPMENT_STATUS_MAP: Record<string, ShipmentStatus> = {
  // ── Official codes (PDF table) ─────────────────────────────────────────────
  DEL: ShipmentStatus.DELIVERED, // 1 Delivered
  INT: ShipmentStatus.IN_TRANSIT, // 2 In Transit
  UND: ShipmentStatus.FAILED_DELIVERY, // 3 Undelivered
  RTO: ShipmentStatus.RTO, // 4 RTO
  RTD: ShipmentStatus.RTO, // 5 RTO Delivered
  CAN: ShipmentStatus.CANCELLED, // 6 Cancelled
  SCH: ShipmentStatus.PROCESSING, // 7 Shipment Booked
  PKP: ShipmentStatus.PICKUP_COMPLETE, // 8 Picked Up
  ONH: ShipmentStatus.PROCESSING, // 9 On Hold
  OOD: ShipmentStatus.OUT_FOR_DELIVERY, // 10 Out for Delivery (official)
  NWI: ShipmentStatus.IN_TRANSIT, // 11 Network Issue
  DNB: ShipmentStatus.IN_TRANSIT, // 12 Delivery Next Day
  NFI: ShipmentStatus.PENDING, // 13 Not Found/Incorrect
  ODA: ShipmentStatus.FAILED_DELIVERY, // 14 Out of Delivery Area
  OTH: ShipmentStatus.IN_TRANSIT, // 20 Others
  SMD: ShipmentStatus.IN_TRANSIT, // 21 Delivery Delayed
  '22': ShipmentStatus.FAILED_DELIVERY, // Address Incorrect
  '23': ShipmentStatus.FAILED_DELIVERY, // Delivery Attempted
  '24': ShipmentStatus.FAILED_DELIVERY, // Pending - Undelivered
  '25': ShipmentStatus.FAILED_DELIVERY, // Delivery Attempted-Premises Closed
  CRTA: ShipmentStatus.FAILED_DELIVERY, // 26 Customer Refused
  CNA: ShipmentStatus.FAILED_DELIVERY, // 27 Consignee Unavailable
  DEX: ShipmentStatus.FAILED_DELIVERY, // 28 Delivery Exception
  DRE: ShipmentStatus.IN_TRANSIT, // 30 Delivery Rescheduled
  PNR: ShipmentStatus.FAILED_DELIVERY, // 31 COD Payment Not Ready
  LOST: ShipmentStatus.FAILED_DELIVERY, // 32 Lost

  // ── Official labels (same PDF) ─────────────────────────────────────────────
  Delivered: ShipmentStatus.DELIVERED,
  'In Transit': ShipmentStatus.IN_TRANSIT,
  Undelivered: ShipmentStatus.FAILED_DELIVERY,
  'RTO Delivered': ShipmentStatus.RTO,
  Cancelled: ShipmentStatus.CANCELLED,
  'Shipment Booked': ShipmentStatus.PROCESSING,
  'Picked Up': ShipmentStatus.PICKUP_COMPLETE,
  'On Hold': ShipmentStatus.PROCESSING,
  'Out for Delivery': ShipmentStatus.OUT_FOR_DELIVERY,
  'Out For Delivery': ShipmentStatus.OUT_FOR_DELIVERY, // scan status_detail spelling
  'Delivered to consignee': ShipmentStatus.DELIVERED,
  'Delivered To Consignee': ShipmentStatus.DELIVERED,
  'Shipment Received at Facility': ShipmentStatus.IN_TRANSIT,
  'Bag Received at Facility': ShipmentStatus.IN_TRANSIT,
  'Call placed to consignee': ShipmentStatus.OUT_FOR_DELIVERY,
  'Network Issue': ShipmentStatus.IN_TRANSIT,
  'Delivery Next Day': ShipmentStatus.IN_TRANSIT,
  'Not Found/Incorrect': ShipmentStatus.PENDING,
  'Not Found': ShipmentStatus.PENDING,
  'Status Pending': ShipmentStatus.PENDING,
  'Out of Delivery Area': ShipmentStatus.FAILED_DELIVERY,
  Others: ShipmentStatus.IN_TRANSIT,
  'Delivery Delayed': ShipmentStatus.IN_TRANSIT,
  'Address Incorrect': ShipmentStatus.FAILED_DELIVERY,
  'Delivery Attempted': ShipmentStatus.FAILED_DELIVERY,
  Attempted: ShipmentStatus.FAILED_DELIVERY,
  'Pending - Undelivered': ShipmentStatus.FAILED_DELIVERY,
  'Delivery Attempted-Premises Closed': ShipmentStatus.FAILED_DELIVERY,
  'Customer Refused': ShipmentStatus.FAILED_DELIVERY,
  'Consignee Unavailable': ShipmentStatus.FAILED_DELIVERY,
  'Delivery Exception': ShipmentStatus.FAILED_DELIVERY,
  'Delivery Rescheduled': ShipmentStatus.IN_TRANSIT,
  'COD Payment Not Ready': ShipmentStatus.FAILED_DELIVERY,
  Lost: ShipmentStatus.FAILED_DELIVERY,

  // ── OMS / shipping-automation extras (app.shipway.com) ─────────────────────
  OFD: ShipmentStatus.OUT_FOR_DELIVERY, // alias of OOD
  RAD: ShipmentStatus.OUT_FOR_DELIVERY, // reached / ready at destination; Shipway track page + OFD email
  'Reached At Destination': ShipmentStatus.OUT_FOR_DELIVERY,
  'Reached Destination': ShipmentStatus.OUT_FOR_DELIVERY,
  'Ready For Delivery': ShipmentStatus.OUT_FOR_DELIVERY,
  RSCH: ShipmentStatus.PICKUP_PENDING, // Pickup Scheduled
  ROOP: ShipmentStatus.PICKUP_PENDING, // Out for Pickup
  RPKP: ShipmentStatus.PICKUP_COMPLETE, // Shipment Picked Up
  PCAN: ShipmentStatus.CANCELLED, // Pickup Cancelled
  RPF: ShipmentStatus.PICKUP_PENDING, // Pickup Failed
  PKF: ShipmentStatus.PICKUP_PENDING,
  RINT: ShipmentStatus.RTO_INITIATED, // Return In Transit
  RDEL: ShipmentStatus.RTO, // Return Delivered
  NDR: ShipmentStatus.NDR,
  'NDR Action Required': ShipmentStatus.NDR,
  'Failed Delivery': ShipmentStatus.FAILED_DELIVERY,
  'RTO Initiated': ShipmentStatus.RTO_INITIATED,
  'RTO Picked': ShipmentStatus.RTO_INITIATED,
  'RTO In Transit': ShipmentStatus.RTO_INITIATED,
  Pending: ShipmentStatus.PENDING,
  Confirmed: ShipmentStatus.CONFIRMED,
  Processing: ShipmentStatus.PROCESSING,
  'Label Generated': ShipmentStatus.PROCESSING,
  'Pickup Pending': ShipmentStatus.PICKUP_PENDING,
  'Pickup Exception': ShipmentStatus.PICKUP_PENDING,
  'Pickup Complete': ShipmentStatus.PICKUP_COMPLETE,
  'Pickup Failed': ShipmentStatus.PICKUP_PENDING,
  'Pickup Scheduled': ShipmentStatus.PICKUP_PENDING,
  'Out for Pickup': ShipmentStatus.PICKUP_PENDING,
};

export const SHIPMENT_TO_ORDER_STATUS_MAP: Partial<Record<ShipmentStatus, OrderStatus>> = {
  [ShipmentStatus.PENDING]: OrderStatus.CONFIRMED,
  [ShipmentStatus.CONFIRMED]: OrderStatus.CONFIRMED,
  [ShipmentStatus.PROCESSING]: OrderStatus.PROCESSING,
  [ShipmentStatus.PICKUP_PENDING]: OrderStatus.PROCESSING,
  // Picked Up / Pickup Complete → Dispatched (step 2) on the order
  [ShipmentStatus.PICKUP_COMPLETE]: OrderStatus.SHIPPED,
  [ShipmentStatus.IN_TRANSIT]: OrderStatus.SHIPPED,
  [ShipmentStatus.OUT_FOR_DELIVERY]: OrderStatus.OUT_FOR_DELIVERY,
  [ShipmentStatus.DELIVERED]: OrderStatus.DELIVERED,
  [ShipmentStatus.CANCELLED]: OrderStatus.CANCELLED,
  [ShipmentStatus.FAILED_DELIVERY]: OrderStatus.FAILED_DELIVERY,
  [ShipmentStatus.RTO_INITIATED]: OrderStatus.RTO,
  [ShipmentStatus.RTO]: OrderStatus.RTO,
};

/** Courier-internal scans we do not show on the customer timeline. */
export const HIDDEN_SHIPWAY_SCAN_STATUSES = new Set([
  'manifest uploaded',
  'weight captured',
]);

export function normalizeShipwayStatusKey(shipwayStatus: string): string {
  const trimmed = shipwayStatus.trim();
  if (!trimmed) return trimmed;

  const upper = trimmed.toUpperCase();
  if (/^[A-Z0-9]{1,5}$/i.test(trimmed)) {
    return upper;
  }

  const lower = trimmed.toLowerCase();
  const titleCased = lower.replace(/\b\w/g, (c) => c.toUpperCase());
  return titleCased;
}
