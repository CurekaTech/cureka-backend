export const MANUFACTURER_NAME_MAX = 255;

/**
 * Sheet Manufacture Address → manufacturers.name (truncated to varchar(255)).
 * Duplicate address text is allowed; Product ID uniqueness is enforced via code.
 */
export const toStoredManufacturerName = (address: string): string => {
  const trimmed = address.trim();
  return trimmed.length <= MANUFACTURER_NAME_MAX
    ? trimmed
    : trimmed.slice(0, MANUFACTURER_NAME_MAX);
};

/**
 * Stable unique manufacturers.code for a sheet Product ID (name may duplicate).
 * @example toManufacturerImportCode('54141') → 'EXT54141'
 */
export const toManufacturerImportCode = (productId: string): string =>
  `EXT${productId.trim()}`.slice(0, 100);
