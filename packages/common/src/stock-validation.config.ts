/**
 * Inventory / OOS mode from env.
 *
 * STOCK_INVENTORY_MANAGEMENT_ENABLED=true  → managed (stock ↔ OOS synced; qty enforced)
 * STOCK_INVENTORY_MANAGEMENT_ENABLED=false → flag-only (legacy; stock independent; qty bypass)
 *
 * Default when unset: true (current managed behavior).
 */
const parseEnvBool = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
};

export const STOCK_INVENTORY_MANAGEMENT_ENABLED = parseEnvBool(
  process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'],
  true,
);

/**
 * Qty enforcement for cart/checkout/search helpers.
 * Tied to inventory management so flag-only mode also bypasses stock checks.
 */
export const STOCK_VALIDATION_ENABLED = STOCK_INVENTORY_MANAGEMENT_ENABLED;

/** Whether a variant should be treated as in stock for API/search/checkout surfaces. */
export const isVariantInStock = (stock: number | null | undefined): boolean =>
  !STOCK_VALIDATION_ENABLED || (stock ?? 0) > 0;

/**
 * Stock quantity returned to storefront/cart when validation is bypassed.
 * Ensures clients that check `stock > 0` or `stock >= quantity` still allow purchase.
 */
export const getSalableStockQuantity = (
  actualStock: number | null | undefined,
  minimumRequired = 1,
): number => {
  const stock = actualStock ?? 0;
  if (!STOCK_VALIDATION_ENABLED) {
    return Math.max(stock, minimumRequired, 1);
  }
  return stock;
};
