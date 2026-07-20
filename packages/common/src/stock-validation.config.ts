/**
 * Temporary kill-switch for stock checks and in-stock flags across the app.
 * Set back to `true` when inventory enforcement should resume.
 */
export const STOCK_VALIDATION_ENABLED = false;

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
