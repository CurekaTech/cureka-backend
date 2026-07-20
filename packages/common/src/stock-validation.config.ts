/**
 * Temporary kill-switch for stock checks and in-stock flags across the app.
 * Set back to `true` when inventory enforcement should resume.
 */
export const STOCK_VALIDATION_ENABLED = false;

/** Whether a variant should be treated as in stock for API/search/checkout surfaces. */
export const isVariantInStock = (stock: number | null | undefined): boolean =>
  !STOCK_VALIDATION_ENABLED || (stock ?? 0) > 0;
