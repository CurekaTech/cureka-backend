export function parseAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveMandateMaxAmount(params: {
  productMandateMaxAmount?: string | number | null;
  globalMandateMaxAmount?: string | number | null;
}): string | null {
  const product = parseAmount(params.productMandateMaxAmount);
  if (product > 0) return product.toFixed(2);
  const global = parseAmount(params.globalMandateMaxAmount);
  if (global > 0) return global.toFixed(2);
  return null;
}

export function isAmountWithinMandateLimit(
  amount: string | number,
  maxAmount: string | number | null | undefined,
): boolean {
  if (maxAmount == null || maxAmount === '') return false;
  return parseAmount(amount) <= parseAmount(maxAmount) + Number.EPSILON;
}
