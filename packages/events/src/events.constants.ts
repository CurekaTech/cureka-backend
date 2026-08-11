export const EVENTS = {
  // User domain
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // Admin domain
  ADMIN_USER_CREATED: 'admin-user.created',
  ADMIN_USER_LOGIN: 'admin-user.login',

  // Placeholder — extend as modules are added
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_CANCELLED: 'order.cancelled',
  SHIPMENT_UPDATED: 'shipment.updated',
  PAYMENT_COMPLETED: 'payment.completed',
  NOTIFICATION_SEND: 'notification.send',

  // Cache invalidation domain events
  ATTRIBUTE_UPDATED: 'cache.attribute.updated',
  CATEGORY_UPDATED: 'cache.category.updated',
  PRODUCT_UPDATED: 'cache.product.updated',
  BRAND_UPDATED: 'cache.brand.updated',
  HEALTH_CONCERN_UPDATED: 'cache.health-concern.updated',
  BANNER_UPDATED: 'cache.banner.updated',
  WATCH_AND_SHOP_UPDATED: 'cache.watch-and-shop.updated',
  EXPERT_TALK_UPDATED: 'cache.expert-talk.updated',
  TESTIMONIAL_UPDATED: 'cache.testimonial.updated',
  IMPORTER_UPDATED: 'cache.importer.updated',
  PACKER_UPDATED: 'cache.packer.updated',
  SUBSCRIPTION_FREQUENCY_UPDATED: 'cache.subscription-frequency.updated',
} as const;

export type AppEvent = (typeof EVENTS)[keyof typeof EVENTS];
