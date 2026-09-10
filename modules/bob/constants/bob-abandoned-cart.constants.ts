export const BOB_ABANDONED_CART_NOTIFY_KIND = 'abandoned-cart';

/** Tenant-confirmed BOB path. `/abandoned-cart` returns path-not-found. */
export const BOB_ABANDONED_CART_PATH = '/abancart';

export const BOB_ABANDONED_CART_JOB = {
  SCAN: 'scan',
  SEND: 'send',
} as const;

export const BOB_ABANDONED_CART_SCAN_JOB_ID = 'bob-abandoned-cart-scan';

export const BOB_ABANDONED_CART_CLAIM_LEASE_MS = 60_000;

export const BOB_ABANDONED_CART_PERMANENT_HTTP = new Set([400, 401, 403, 404, 409, 422]);

export type BobAbandonedCartSendJobData = {
  outboxId: string;
  userId: string;
  cartId: string;
  cartRefId: string;
};
