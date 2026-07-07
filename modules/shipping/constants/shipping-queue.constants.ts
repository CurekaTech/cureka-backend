export const SHIPPING_JOB_NAMES = {
  PUSH_ORDER_TO_SHIPWAY: 'push-order-to-shipway',
  SYNC_SHIPMENT_STATUS: 'sync-shipment-status',
} as const;

export type ShippingJobName = (typeof SHIPPING_JOB_NAMES)[keyof typeof SHIPPING_JOB_NAMES];

export interface PushOrderToShipwayJobData {
  orderId: string;
}

export interface SyncShipmentStatusJobData {
  orderId: string;
}

export type ShippingJobData = PushOrderToShipwayJobData | SyncShipmentStatusJobData;
