export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  EMAILS: 'emails',
  ORDER_PROCESSING: 'order-processing',
  ANALYTICS: 'analytics',
  UNICOMMERCE: 'unicommerce',
  UNICOMMERCE_PRODUCTS: 'unicommerce-products',
  GOKWIK: 'gokwik',
  PRODUCT_SUBSCRIPTION_RENEWAL: 'product-subscription-renewal',
  PRODUCT_SUBSCRIPTION_REMINDER: 'product-subscription-reminder',
  MEMBERSHIP_RENEWAL: 'membership-renewal',
  MEMBERSHIP_REMINDER: 'membership-reminder',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
