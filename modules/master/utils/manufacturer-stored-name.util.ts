export const MANUFACTURER_NAME_MAX = 255;

/**
 * Build a unique manufacturers.name from sheet Manufacture Address.
 * Product ID is always appended when present because name is UNIQUE and
 * the manufacture sheet repeats the same address across many products.
 *
 * @example
 *   toStoredManufacturerName('Foo Plant, City', '16794')
 *   // → 'Foo Plant, City [16794]'
 */
export const toStoredManufacturerName = (address: string, productId: string): string => {
  const trimmed = address.trim();
  const id = productId.trim();
  const suffix = id ? ` [${id}]` : '';

  if (!suffix) {
    return trimmed.length <= MANUFACTURER_NAME_MAX
      ? trimmed
      : trimmed.slice(0, MANUFACTURER_NAME_MAX);
  }

  const maxBaseLength = Math.max(1, MANUFACTURER_NAME_MAX - suffix.length);
  const base =
    trimmed.length <= maxBaseLength ? trimmed : trimmed.slice(0, maxBaseLength);
  return `${base}${suffix}`;
};
