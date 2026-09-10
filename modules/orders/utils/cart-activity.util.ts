import { CartEntity } from '../entities/cart.entity';

/**
 * Customer-facing cart inactivity.
 *
 * Prefer `lastCustomerActivityAt` (item add/qty/remove/move). Fallback for
 * carts that predate the column: GREATEST(cart.updatedAt, item.updatedAt).
 * Cron, reads, coupon sync, and notify attempts must not write the dedicated field.
 */
export function resolveCartCustomerActivityAt(cart: CartEntity): Date {
  if (cart.lastCustomerActivityAt) {
    return cart.lastCustomerActivityAt;
  }

  const timestamps = [
    cart.updatedAt?.getTime() ?? 0,
    cart.createdAt?.getTime() ?? 0,
    ...(cart.items ?? []).map((item) => item.updatedAt?.getTime() ?? item.createdAt?.getTime() ?? 0),
  ].filter((value) => Number.isFinite(value) && value > 0);

  return new Date(timestamps.length ? Math.max(...timestamps) : Date.now());
}

export const CART_CUSTOMER_ACTIVITY_SQL =
  'COALESCE(cart.last_customer_activity_at, GREATEST(cart.updated_at, MAX(items.updated_at)))';
