export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  EMAILS: 'emails',
  ORDER_PROCESSING: 'order-processing',
  ANALYTICS: 'analytics',
  SHIPPING: 'shipping',
  UNICOMMERCE: 'unicommerce',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
