import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Computes when a return/replacement window closes.
 *
 * The clock starts at the actual delivery timestamp of the item's shipment — not
 * the order date and not the shipping date. Returns `null` when the item has no
 * reliable delivery timestamp or no configured window.
 */
export const resolveWindowExpiry = (
  deliveredAt: Date | null | undefined,
  window: number | null | undefined,
  unit: PolicyWindowUnit,
): Date | null => {
  if (!deliveredAt || window === null || window === undefined || window <= 0) {
    return null;
  }
  const durationMs = unit === PolicyWindowUnit.HOURS ? window * HOUR_MS : window * DAY_MS;
  return new Date(deliveredAt.getTime() + durationMs);
};

export const isWithinWindow = (expiresAt: Date | null, now: Date = new Date()): boolean =>
  expiresAt !== null && now.getTime() <= expiresAt.getTime();
