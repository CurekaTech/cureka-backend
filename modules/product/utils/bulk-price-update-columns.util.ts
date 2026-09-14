export const BULK_PRICE_UPDATE_HEADERS = [
  'SKU',
  'Product Id',
  'MRP',
  'Selling Price',
] as const;

export type BulkPriceUpdateHeader = (typeof BULK_PRICE_UPDATE_HEADERS)[number];

/** Normalized header keys used by the parser. */
export const normalizePriceHeader = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, ' ');

export const resolvePriceColumnKey = (header: string): string | null => {
  const key = normalizePriceHeader(header);
  if (key === 'sku' || key === 'product sku code' || key === 'product sku code*') return 'sku';
  if (
    key === 'product id' ||
    key === 'product id (string)' ||
    key === 'external product id' ||
    key === 'woocommerce product id' ||
    key === 'id'
  ) {
    return 'productId';
  }
  if (key === 'mrp' || key === 'mrp (rs)' || key === 'mrp (rs)*' || key === 'regular price') {
    return 'mrp';
  }
  if (
    key === 'selling price' ||
    key === 'selling price (rs)' ||
    key === 'selling price (rs)*' ||
    key === 'sale price'
  ) {
    return 'sellingPrice';
  }
  return null;
};
