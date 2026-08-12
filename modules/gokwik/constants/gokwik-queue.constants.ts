export const GOKWIK_JOB_NAMES = {
  PROCESS_WEBHOOK: 'process-webhook',
  SYNC_PRODUCT: 'sync-product',
  SYNC_COLLECTION: 'sync-collection',
  PUSH_FULFILLMENT: 'push-fulfillment',
  PUSH_ORDER_STATUS: 'push-order-status',
} as const;

export type ProcessGokwikWebhookJobData = {
  eventId: string;
};

export type SyncGokwikResourceJobData = {
  resourceId: string;
};

export type PushGokwikFulfillmentJobData = {
  orderId: string;
};

export type PushGokwikOrderStatusJobData = {
  orderId: string;
  orderStatus: 'Confirmed' | 'Pending' | 'Failed' | 'Cancelled';
};
