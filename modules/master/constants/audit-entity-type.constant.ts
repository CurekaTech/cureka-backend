export const AuditEntityType = {
  BLOG_POST: 'blog_post',
  SUPPORT_TICKET: 'support_ticket',
  RETURN_REQUEST: 'return_request',
  RETURN_POLICY: 'return_policy',
  COD_PAYOUT: 'cod_payout',
  WALLET_ACCOUNT: 'wallet_account',
  PRODUCT: 'product',
  ORDER: 'order',
  USER: 'user',
  USER_ADDRESS: 'user_address',
  BRAND: 'brand',
  CATEGORY: 'category',
  COUPON: 'coupon',
  BANNER: 'banner',
  ADMIN_SETTING: 'admin_setting',
  COD_BLOCKLIST: 'cod_blocklist',
  PERMISSION: 'permission',
  REPORT: 'report',
  PRODUCT_SUBSCRIPTION: 'product_subscription',
  PRODUCT_SUBSCRIPTION_CONFIG: 'product_subscription_config',
} as const;

export type AuditEntityTypeValue =
  (typeof AuditEntityType)[keyof typeof AuditEntityType];
