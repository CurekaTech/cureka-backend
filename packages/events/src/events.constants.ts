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
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_UPDATED: 'order.updated',
  ORDER_CANCELLED: 'order.cancelled',
  SHIPMENT_UPDATED: 'shipment.updated',
  CHECKOUT_CART_ABANDONED: 'checkout.cart.abandoned',
  REFUND_REQUEST_CREATED: 'refund.request.created',
  REFUND_REQUEST_APPROVED: 'refund.request.approved',
  REFUND_REQUEST_REJECTED: 'refund.request.rejected',
  REFUND_PROCESSING_STARTED: 'refund.processing.started',
  REFUND_PROCESSED: 'refund.processed',
  REFUND_FAILED: 'refund.failed',
  REFUND_PROVIDER_UPDATED: 'refund.provider.updated',
  REFUND_WALLET_CREDITED: 'refund.wallet.credited',
  COD_PAYOUT_UPDATED: 'cod.payout.updated',

  // Return domain
  RETURN_REQUEST_CREATED: 'return.request.created',
  RETURN_REQUEST_APPROVED: 'return.request.approved',
  RETURN_REQUEST_REJECTED: 'return.request.rejected',
  RETURN_INFORMATION_REQUESTED: 'return.information.requested',
  RETURN_PICKUP_SCHEDULED: 'return.pickup.scheduled',
  RETURN_PICKUP_UPDATED: 'return.pickup.updated',
  RETURN_RECEIVED_AT_WAREHOUSE: 'return.received.warehouse',
  RETURN_QC_COMPLETED: 'return.qc.completed',
  RETURN_REFUND_LINKED: 'return.refund.linked',
  RETURN_REPLACEMENT_LINKED: 'return.replacement.linked',
  RETURN_COMPLETED: 'return.completed',
  RETURN_CANCELLED: 'return.cancelled',
  SHIPWAY_WEBHOOK_RECEIVED: 'shipway.webhook.received',

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
  WELLNESS_GOAL_UPDATED: 'cache.wellness-goal.updated',
  HOME_SECTION_UPDATED: 'cache.home-section.updated',
  BLOG_POST_UPDATED: 'cache.blog-post.updated',
  CMS_PAGE_UPDATED: 'cache.cms-page.updated',
  SUPPORT_ARTICLE_UPDATED: 'cache.support-article.updated',
} as const;

export type AppEvent = (typeof EVENTS)[keyof typeof EVENTS];
