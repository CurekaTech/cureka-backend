import { isStockInventoryManagementEnabled } from '@packages/common/stock-validation.config';

export type StockAvailabilityState = {
  stock: number;
  outOfStock: boolean;
};

export type StockAvailabilityResult = StockAvailabilityState & {
  /** True only when transitioning INS → OOS (flag). Drives OOS email. */
  becameOos: boolean;
  /** True only when transitioning OOS → INS (flag). */
  becameIns: boolean;
};

export type StockAvailabilityOptions = {
  /** Override env; defaults to isStockInventoryManagementEnabled(). */
  managementEnabled?: boolean;
};

const normalizeStock = (stock: number): number => {
  if (!Number.isFinite(stock)) return 0;
  return Math.max(0, Math.trunc(stock));
};

const isManaged = (options?: StockAvailabilityOptions): boolean =>
  options?.managementEnabled ?? isStockInventoryManagementEnabled();

/**
 * Manual OOS.
 * Managed: force stock to 0 and outOfStock true.
 * Flag-only: set outOfStock true, keep stock.
 */
export const resolveManualOutOfStock = (
  current: StockAvailabilityState,
  options?: StockAvailabilityOptions,
): StockAvailabilityResult => {
  const becameOos = !current.outOfStock;
  if (!isManaged(options)) {
    return {
      stock: normalizeStock(current.stock),
      outOfStock: true,
      becameOos,
      becameIns: false,
    };
  }
  return {
    stock: 0,
    outOfStock: true,
    becameOos,
    becameIns: false,
  };
};

/**
 * Derive availability from absolute stock quantity.
 * Managed: stock 0 → OOS; stock > 0 → INS.
 * Flag-only: update stock only; leave outOfStock unchanged (becameOos always false).
 */
export const resolveAvailabilityFromStock = (
  stock: number,
  previousOutOfStock: boolean,
  options?: StockAvailabilityOptions,
): StockAvailabilityResult => {
  const nextStock = normalizeStock(stock);
  if (!isManaged(options)) {
    return {
      stock: nextStock,
      outOfStock: previousOutOfStock,
      becameOos: false,
      becameIns: false,
    };
  }
  const outOfStock = nextStock <= 0;
  return {
    stock: nextStock,
    outOfStock,
    becameOos: !previousOutOfStock && outOfStock,
    becameIns: previousOutOfStock && !outOfStock,
  };
};

/**
 * Apply a signed stock delta (orders decrement, cancel/return increment).
 */
export const resolveAvailabilityFromDelta = (
  current: StockAvailabilityState,
  delta: number,
  options?: StockAvailabilityOptions,
): StockAvailabilityResult => {
  const nextRaw = (Number.isFinite(current.stock) ? current.stock : 0) + delta;
  return resolveAvailabilityFromStock(nextRaw, current.outOfStock, options);
};

/**
 * Explicit mark INS.
 * Managed: only valid when resulting stock > 0 (else stays OOS).
 * Flag-only: set outOfStock false; keep/set stock without forcing OOS at zero.
 */
export const resolveManualInStock = (
  current: StockAvailabilityState,
  stock?: number,
  options?: StockAvailabilityOptions,
): StockAvailabilityResult => {
  const nextStock = stock === undefined ? normalizeStock(current.stock) : normalizeStock(stock);
  if (!isManaged(options)) {
    return {
      stock: nextStock,
      outOfStock: false,
      becameOos: false,
      becameIns: current.outOfStock,
    };
  }
  if (nextStock <= 0) {
    return {
      stock: 0,
      outOfStock: true,
      becameOos: !current.outOfStock,
      becameIns: false,
    };
  }
  return {
    stock: nextStock,
    outOfStock: false,
    becameOos: false,
    becameIns: current.outOfStock,
  };
};

/**
 * Admin create/update payload resolution.
 *
 * Managed: honor outOfStock / sync from stock as usual.
 * Flag-only: stock must not drive the OOS flag. Admin UIs often re-send
 * `outOfStock: (stock <= 0)` with every save — that stock-coupled value is ignored.
 * Intentional flag control on this payload only when it diverges from stock
 * (e.g. OOS with stock > 0, or INS with stock 0). Prefer bulk OOS / restore APIs
 * for normal flag toggles.
 */
export const resolveAvailabilityFromAdminDto = (
  previous: StockAvailabilityState,
  dto: { stock: number; outOfStock?: boolean },
  options?: StockAvailabilityOptions,
): StockAvailabilityResult => {
  const nextStock = normalizeStock(dto.stock);

  if (isManaged(options)) {
    if (dto.outOfStock === true) {
      return resolveManualOutOfStock(
        { stock: nextStock, outOfStock: previous.outOfStock },
        options,
      );
    }
    if (dto.outOfStock === false) {
      return resolveManualInStock(previous, nextStock, options);
    }
    return resolveAvailabilityFromStock(nextStock, previous.outOfStock, options);
  }

  // Flag-only: stock-only unless outOfStock clearly diverges from stock coupling.
  if (dto.outOfStock === undefined) {
    return resolveAvailabilityFromStock(nextStock, previous.outOfStock, options);
  }
  const stockDerivedOos = nextStock <= 0;
  const looksStockDerived = dto.outOfStock === stockDerivedOos;
  if (looksStockDerived) {
    return resolveAvailabilityFromStock(nextStock, previous.outOfStock, options);
  }
  if (dto.outOfStock) {
    return resolveManualOutOfStock(
      { stock: nextStock, outOfStock: previous.outOfStock },
      options,
    );
  }
  return resolveManualInStock(previous, nextStock, options);
};

/**
 * Bulk restore stock: set quantity and clear OOS when stock > 0.
 * stock === 0: managed → OOS; flag-only → leave previous flag (typically stays OOS).
 */
export const resolveRestoreStock = (
  current: StockAvailabilityState,
  stock: number,
  options?: StockAvailabilityOptions,
): StockAvailabilityResult => {
  const nextStock = normalizeStock(stock);
  if (nextStock > 0) {
    return resolveManualInStock(current, nextStock, options);
  }
  return resolveAvailabilityFromStock(nextStock, current.outOfStock, options);
};
