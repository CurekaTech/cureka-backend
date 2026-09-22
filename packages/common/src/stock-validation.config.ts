/**
 * Inventory / OOS mode from env + per-variant Cureka inventory flag
 * (read at call time so Nest ConfigModule / dotenv is applied).
 *
 * STOCK_INVENTORY_MANAGEMENT_ENABLED=true  → Cureka inventory feature available globally
 * STOCK_INVENTORY_MANAGEMENT_ENABLED=false → skip stock ledger / auto-OOS for all variants
 *
 * Stock decrement + auto-OOS on order runs only when BOTH are true:
 *   isStockInventoryManagementEnabled() && inCurekaInventory is true
 *
 * Skip stock process when:
 *   1) STOCK_INVENTORY_MANAGEMENT_ENABLED=false  (global)
 *   2) inCurekaInventory=false                     (per variant)
 *
 * Admin OOS/INS flag APIs always work regardless of env / variant flag.
 *
 * Default when env unset: true (feature available; variants still default inCurekaInventory=false).
 */
const parseEnvBool = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
};

/**
 * Coerce DB / driver / QueryBuilder boolean quirks (true | 1 | 'true' | 't').
 * TypeORM pessimistic-lock QueryBuilder can return string booleans on some drivers.
 */
export const coerceDbBoolean = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 't' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'f' || normalized === 'no') {
      return false;
    }
  }
  return false;
};

/** @deprecated Alias — use coerceDbBoolean. */
export const isInCurekaInventoryFlag = (value: unknown): boolean => coerceDbBoolean(value);

/** Prefer this — env is often loaded after first module import. */
export const isStockInventoryManagementEnabled = (): boolean =>
  parseEnvBool(process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'], true);

/**
 * Effective Cureka stock management for a single variant.
 * Env alone is not enough — variant must opt in via inCurekaInventory.
 */
export const isCurekaInventoryManaged = (variant: {
  inCurekaInventory?: boolean | null | string | number;
}): boolean =>
  isStockInventoryManagementEnabled() && coerceDbBoolean(variant.inCurekaInventory);

/**
 * Qty enforcement for a specific variant (or global env when no variant given).
 * Without a variant, falls back to global env (legacy call sites).
 */
export const isStockValidationEnabled = (variant?: {
  inCurekaInventory?: boolean | null | string | number;
}): boolean =>
  variant === undefined
    ? isStockInventoryManagementEnabled()
    : isCurekaInventoryManaged(variant);

/**
 * @deprecated Use isStockInventoryManagementEnabled() — prefer the function.
 */
export const STOCK_INVENTORY_MANAGEMENT_ENABLED = isStockInventoryManagementEnabled;

/**
 * @deprecated Use isStockValidationEnabled() / isCurekaInventoryManaged().
 */
export const STOCK_VALIDATION_ENABLED = isStockValidationEnabled;

/**
 * Whether a variant should be treated as in stock for qty surfaces.
 * When Cureka-managed: stock > 0. Otherwise qty checks are bypassed (OOS flag is separate).
 */
export const isVariantInStock = (
  stock: number | null | undefined,
  variant?: { inCurekaInventory?: boolean | null | string | number },
): boolean => !isStockValidationEnabled(variant) || (stock ?? 0) > 0;

/**
 * Stock quantity returned to storefront/cart when validation is bypassed.
 * Ensures clients that check `stock > 0` or `stock >= quantity` still allow purchase
 * for non-Cureka-managed variants.
 */
export const getSalableStockQuantity = (
  actualStock: number | null | undefined,
  minimumRequired = 1,
  variant?: { inCurekaInventory?: boolean | null | string | number },
): number => {
  const stock = actualStock ?? 0;
  if (!isStockValidationEnabled(variant)) {
    return Math.max(stock, minimumRequired, 1);
  }
  return stock;
};
