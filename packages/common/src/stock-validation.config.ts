/**
 * Inventory / OOS mode from env (read at call time so Nest ConfigModule / dotenv is applied).
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

/** Prefer this — env is often loaded after first module import. */
export const isStockInventoryManagementEnabled = (): boolean =>
  parseEnvBool(process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'], true);

/** Qty enforcement follows the same env. */
export const isStockValidationEnabled = (): boolean => isStockInventoryManagementEnabled();

/**
 * @deprecated Use isStockInventoryManagementEnabled() — this snapshots env at first property access only if reassigned; prefer the function.
 */
export const STOCK_INVENTORY_MANAGEMENT_ENABLED = isStockInventoryManagementEnabled;

/**
 * @deprecated Use isStockValidationEnabled().
 * Alias so existing `STOCK_VALIDATION_ENABLED` call sites can become `STOCK_VALIDATION_ENABLED()` after migration,
 * or keep using isStockValidationEnabled().
 */
export const STOCK_VALIDATION_ENABLED = isStockValidationEnabled;

/** Whether a variant should be treated as in stock for API/search/checkout surfaces. */
export const isVariantInStock = (stock: number | null | undefined): boolean =>
  !isStockValidationEnabled() || (stock ?? 0) > 0;

/**
 * Stock quantity returned to storefront/cart when validation is bypassed.
 * Ensures clients that check `stock > 0` or `stock >= quantity` still allow purchase.
 */
export const getSalableStockQuantity = (
  actualStock: number | null | undefined,
  minimumRequired = 1,
): number => {
  const stock = actualStock ?? 0;
  if (!isStockValidationEnabled()) {
    return Math.max(stock, minimumRequired, 1);
  }
  return stock;
};
