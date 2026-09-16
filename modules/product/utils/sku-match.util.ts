/**
 * Case-sensitive identity key for SKU matching/comparison.
 * Trims whitespace only — `ABC123` and `abc123` are different SKUs.
 *
 * Do **not** use this for product/SKU search queries (those stay ILIKE / case-insensitive).
 */
export const normalizeSkuMatchKey = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};
