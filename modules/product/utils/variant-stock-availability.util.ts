export type StockAvailabilityState = {
  stock: number;
  outOfStock: boolean;
};

export type StockAvailabilityResult = StockAvailabilityState & {
  /** True only when transitioning INS → OOS. */
  becameOos: boolean;
  /** True only when transitioning OOS → INS. */
  becameIns: boolean;
};

const normalizeStock = (stock: number): number => {
  if (!Number.isFinite(stock)) return 0;
  return Math.max(0, Math.trunc(stock));
};

/**
 * Manual OOS: force stock to 0 and outOfStock true.
 */
export const resolveManualOutOfStock = (
  current: StockAvailabilityState,
): StockAvailabilityResult => {
  const becameOos = !current.outOfStock;
  return {
    stock: 0,
    outOfStock: true,
    becameOos,
    becameIns: false,
  };
};

/**
 * Derive availability from absolute stock quantity.
 * stock 0 → OOS; stock > 0 → INS.
 */
export const resolveAvailabilityFromStock = (
  stock: number,
  previousOutOfStock: boolean,
): StockAvailabilityResult => {
  const nextStock = normalizeStock(stock);
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
): StockAvailabilityResult => {
  const nextRaw = (Number.isFinite(current.stock) ? current.stock : 0) + delta;
  return resolveAvailabilityFromStock(nextRaw, current.outOfStock);
};

/**
 * Explicit mark INS is only valid when resulting stock > 0.
 */
export const resolveManualInStock = (
  current: StockAvailabilityState,
  stock?: number,
): StockAvailabilityResult => {
  const nextStock = stock === undefined ? normalizeStock(current.stock) : normalizeStock(stock);
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
