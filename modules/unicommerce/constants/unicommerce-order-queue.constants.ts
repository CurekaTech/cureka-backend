export const UNICOMMERCE_JOB_NAMES = {
  PUSH_ORDER: 'push-order-to-unicommerce',
  CANCEL_ORDER: 'cancel-order-fulfillment',
} as const;

export type UnicommerceJobName =
  (typeof UNICOMMERCE_JOB_NAMES)[keyof typeof UNICOMMERCE_JOB_NAMES];

export interface PushOrderToUnicommerceJobData {
  orderId: string;
}

export interface CancelOrderFulfillmentJobData {
  orderId: string;
}

export type UnicommerceJobData = PushOrderToUnicommerceJobData | CancelOrderFulfillmentJobData;
