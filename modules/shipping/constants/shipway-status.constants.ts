import { ShipmentStatus } from '../enums/shipment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';

/**
 * Canonical mapping from raw Shipway status strings → internal ShipmentStatus.
 *
 * This is the single source of truth for all status translations.
 * Never add status logic anywhere else in the codebase.
 */
export const SHIPWAY_TO_SHIPMENT_STATUS_MAP: Record<string, ShipmentStatus> = {
  // Pre-dispatch
  Pending: ShipmentStatus.PENDING,
  Confirmed: ShipmentStatus.CONFIRMED,
  Processing: ShipmentStatus.PROCESSING,
  'Label Generated': ShipmentStatus.PROCESSING,
  'Pickup Pending': ShipmentStatus.PICKUP_PENDING,
  'Pickup Exception': ShipmentStatus.PICKUP_PENDING,
  'Pickup Complete': ShipmentStatus.PICKUP_COMPLETE,

  // In-transit
  'In Transit': ShipmentStatus.IN_TRANSIT,
  'Out for Delivery': ShipmentStatus.OUT_FOR_DELIVERY,
  Attempted: ShipmentStatus.FAILED_DELIVERY,

  // Terminal — success
  Delivered: ShipmentStatus.DELIVERED,

  // Terminal — failure / RTO
  'Failed Delivery': ShipmentStatus.FAILED_DELIVERY,
  Undelivered: ShipmentStatus.FAILED_DELIVERY,
  'RTO Initiated': ShipmentStatus.RTO_INITIATED,
  'RTO Picked': ShipmentStatus.RTO_INITIATED,
  'RTO In Transit': ShipmentStatus.RTO_INITIATED,
  RTO: ShipmentStatus.RTO,
  'RTO Delivered': ShipmentStatus.RTO,

  // NDR
  NDR: ShipmentStatus.NDR,
  'NDR Action Required': ShipmentStatus.NDR,

  // Cancellation
  Cancelled: ShipmentStatus.CANCELLED,
};

/**
 * Maps internal ShipmentStatus → OrderStatus for syncing the orders table.
 *
 * Only transitions that affect the customer-visible order status are included.
 * NDR and pickup sub-states don't change the order status (they stay at PROCESSING).
 */
export const SHIPMENT_TO_ORDER_STATUS_MAP: Partial<Record<ShipmentStatus, OrderStatus>> = {
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
