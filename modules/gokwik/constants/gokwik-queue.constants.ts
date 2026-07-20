export const GOKWIK_JOB_NAMES = {
  PROCESS_WEBHOOK: 'process-webhook',
  SYNC_PRODUCT: 'sync-product',
  SYNC_COLLECTION: 'sync-collection',
  PUSH_FULFILLMENT: 'push-fulfillment',
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
