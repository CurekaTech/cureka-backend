import { access } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import * as ExcelJS from 'exceljs';
import { normalizeSkuMatchKey } from './sku-match.util';

const DEFAULT_MANUFACTURER_LOOKUP_FILE = 'docs/Manufacture details (1).xlsx';
/** Original WooCommerce export (http URLs). Harvest source + WP image comparison. */
export const DEFAULT_WP_IMAGE_EXPORT_FILE = 'docs/wc-product-export-6-7-2026-1783309274325.xlsx';
/** Harvest output: ID → GCS keys (`images/<uuid>.jpg`). Bulk-upload Product ID lookup. */
export const DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE = 'docs/wp-product-image-gcs-map.xlsx';
export const DEFAULT_IMAGE_HARVEST_CACHE_FILE = 'docs/wp-image-harvest-cache.json';
const DEFAULT_SLUG_LOOKUP_FILE = 'docs/slug sheet.xlsx';
const DEFAULT_PRODUCT_PAGE_URL_LOOKUP_FILE = 'docs/Master-Data-Sheets/ProductUrls.xlsx';

/** Origins stripped so only the storefront path is stored (e.g. `/shop/.../`). */
const PRODUCT_PAGE_URL_ORIGIN_RE = /^https?:\/\/(?:www\.)?cureka\.com/i;

export const normalizeLookupProductId = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return String(Math.trunc(asNumber));
  }
  return trimmed.toLowerCase();
};

/**
 * Convert a full Cureka product URL (or path) into the path stored on variants.
 * `https://www.cureka.com/shop/.../` → `/shop/.../`
 */
export const toProductPagePath = (raw: string | null | undefined): string => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return path.startsWith('/') ? path : `/${path}`;
    } catch {
      // fall through to prefix strip
    }
  }

  const stripped = trimmed.replace(PRODUCT_PAGE_URL_ORIGIN_RE, '');
  if (!stripped) return '';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
};

export const normalizeLookupText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

const resolveLookupPath = (configured: string | undefined, fallback: string): string => {
  const raw = configured?.trim() || fallback;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
};

const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? '').join('').trim();
  }
  if ('result' in value && value.result !== undefined && value.result !== null) {
    return String(value.result).trim();
  }
  if ('text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  return String(cell.text ?? '').trim();
};

const normalizeHeader = (value: string): string =>
  value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

const getHeaderIndex = (headers: Map<string, number>, aliases: string[]): number | undefined => {
  for (const alias of aliases) {
    const index = headers.get(normalizeHeader(alias));
    if (index !== undefined) return index;
  }
  return undefined;
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Manufacture details sheet: ID → Manufacture Address text.
 * Import stores Manufacture Address as manufacturers.name (duplicates OK).
 * Unique key is manufacturers.code = EXT{Product ID}.
 */
export const loadManufacturerAddressByProductId = async (
  filePath = resolveLookupPath(
    process.env['BULK_UPLOAD_MANUFACTURER_LOOKUP_FILE'],
    DEFAULT_MANUFACTURER_LOOKUP_FILE,
  ),
): Promise<{ path: string; loaded: boolean; byProductId: Map<string, string> }> => {
  const byProductId = new Map<string, string>();
  if (!(await fileExists(filePath))) {
    return { path: filePath, loaded: false, byProductId };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { path: filePath, loaded: false, byProductId };
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header) headers.set(header, columnNumber);
  });

  const idColumn = getHeaderIndex(headers, ['ID', 'Product ID', 'External Product ID']);
  const addressColumn = getHeaderIndex(headers, [
    'Manufacture Address',
    'Manufacturer Address',
    'Manufacturing Address',
    'Address',
  ]);

  if (idColumn === undefined || addressColumn === undefined) {
    return { path: filePath, loaded: false, byProductId };
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const productId = normalizeLookupProductId(cellText(row.getCell(idColumn)));
    const address = cellText(row.getCell(addressColumn)).trim();
    if (!productId || !address || byProductId.has(productId)) continue;
    byProductId.set(productId, address);
  }

  return { path: filePath, loaded: true, byProductId };
};

/**
 * Product ID → ordered image locators (comma-separated).
 * Harvest map uses GCS keys (`images/<uuid>.jpg`). First key is primary.
 */
export const loadImageUrlsByProductId = async (
  filePath = resolveLookupPath(
    process.env['BULK_UPLOAD_IMAGE_LOOKUP_FILE'],
    DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
  ),
): Promise<{ path: string; loaded: boolean; byProductId: Map<string, string[]> }> => {
  const byProductId = new Map<string, string[]>();
  if (!(await fileExists(filePath))) {
    return { path: filePath, loaded: false, byProductId };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { path: filePath, loaded: false, byProductId };
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header) headers.set(header, columnNumber);
  });

  const idColumn = getHeaderIndex(headers, ['ID', 'Product ID', 'External Product ID']);
  const imagesColumn = getHeaderIndex(headers, ['Images', 'Image', 'Image URLs', 'Image Url']);

  if (idColumn === undefined || imagesColumn === undefined) {
    return { path: filePath, loaded: false, byProductId };
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const productId = normalizeLookupProductId(cellText(row.getCell(idColumn)));
    const imagesRaw = cellText(row.getCell(imagesColumn));
    if (!productId || !imagesRaw || byProductId.has(productId)) continue;

    const urls = imagesRaw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!urls.length) continue;
    byProductId.set(productId, urls);
  }

  return { path: filePath, loaded: true, byProductId };
};

const parseImageUrlList = (imagesRaw: string): string[] =>
  imagesRaw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/** Case-sensitive SKU identity key (trim only). Search stays case-insensitive elsewhere. */
export const normalizeLookupSku = (value: string | number | null | undefined): string =>
  normalizeSkuMatchKey(value);

/**
 * WC product export: SKU + ID → ordered image URLs.
 * Read once. SKU is preferred for the image-URL comparison export.
 * Bulk-upload Product ID images use the harvested GCS map instead.
 */
export const loadWpImageLookup = async (
  filePath = resolveLookupPath(
    process.env['BULK_UPLOAD_WP_IMAGE_LOOKUP_FILE'],
    DEFAULT_WP_IMAGE_EXPORT_FILE,
  ),
): Promise<{
  path: string;
  loaded: boolean;
  bySku: Map<string, string[]>;
  byProductId: Map<string, string[]>;
}> => {
  const bySku = new Map<string, string[]>();
  const byProductId = new Map<string, string[]>();
  if (!(await fileExists(filePath))) {
    return { path: filePath, loaded: false, bySku, byProductId };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { path: filePath, loaded: false, bySku, byProductId };
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header) headers.set(header, columnNumber);
  });

  const idColumn = getHeaderIndex(headers, ['ID', 'Product ID', 'External Product ID']);
  const skuColumn = getHeaderIndex(headers, ['SKU', 'Sku', 'Product SKU']);
  const imagesColumn = getHeaderIndex(headers, ['Images', 'Image', 'Image URLs', 'Image Url']);

  if (imagesColumn === undefined || (idColumn === undefined && skuColumn === undefined)) {
    return { path: filePath, loaded: false, bySku, byProductId };
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const imagesRaw = cellText(row.getCell(imagesColumn));
    if (!imagesRaw) continue;
    const urls = parseImageUrlList(imagesRaw);
    if (!urls.length) continue;

    if (skuColumn !== undefined) {
      const sku = normalizeLookupSku(cellText(row.getCell(skuColumn)));
      if (sku && !bySku.has(sku)) {
        bySku.set(sku, urls);
      }
    }

    if (idColumn !== undefined) {
      const productId = normalizeLookupProductId(cellText(row.getCell(idColumn)));
      if (productId && !byProductId.has(productId)) {
        byProductId.set(productId, urls);
      }
    }
  }

  return {
    path: filePath,
    loaded: bySku.size > 0 || byProductId.size > 0,
    bySku,
    byProductId,
  };
};

/**
 * Client slug sheet: Product ID → slug.
 * The lookup value replaces the current product/variant slug during a
 * successful bulk create or update.
 */
export const loadSlugsByProductId = async (
  filePath = resolveLookupPath(
    process.env['BULK_UPLOAD_SLUG_LOOKUP_FILE'],
    DEFAULT_SLUG_LOOKUP_FILE,
  ),
): Promise<{ path: string; loaded: boolean; byProductId: Map<string, string> }> => {
  const byProductId = new Map<string, string>();
  if (!(await fileExists(filePath))) {
    return { path: filePath, loaded: false, byProductId };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { path: filePath, loaded: false, byProductId };
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header) headers.set(header, columnNumber);
  });

  const idColumn = getHeaderIndex(headers, ['ID', 'Product ID', 'External Product ID']);
  const slugColumn = getHeaderIndex(headers, ['Slug', 'Slug URL', 'Product URL Slug']);
  if (idColumn === undefined || slugColumn === undefined) {
    return { path: filePath, loaded: false, byProductId };
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const productId = normalizeLookupProductId(cellText(row.getCell(idColumn)));
    const slug = cellText(row.getCell(slugColumn)).trim();
    if (!productId || !slug || byProductId.has(productId)) continue;
    byProductId.set(productId, slug);
  }

  return { path: filePath, loaded: true, byProductId };
};

/**
 * Client ProductUrls sheet: ID → storefront path (`/shop/.../`).
 * Full `https://www.cureka.com/...` values are normalized to path-only.
 * Prefers a worksheet that has both `ID` and `product_page_url` columns.
 */
export const loadProductPageUrlsByProductId = async (
  filePath = resolveLookupPath(
    process.env['BULK_UPLOAD_PRODUCT_PAGE_URL_LOOKUP_FILE'],
    DEFAULT_PRODUCT_PAGE_URL_LOOKUP_FILE,
  ),
): Promise<{ path: string; loaded: boolean; byProductId: Map<string, string> }> => {
  const byProductId = new Map<string, string>();
  if (!(await fileExists(filePath))) {
    return { path: filePath, loaded: false, byProductId };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  let worksheet: ExcelJS.Worksheet | undefined;
  let idColumn: number | undefined;
  let urlColumn: number | undefined;

  for (const candidate of workbook.worksheets) {
    const headers = new Map<string, number>();
    candidate.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const header = normalizeHeader(cellText(cell));
      if (header) headers.set(header, columnNumber);
    });
    const nextIdColumn = getHeaderIndex(headers, ['ID', 'Product ID', 'External Product ID']);
    const nextUrlColumn = getHeaderIndex(headers, [
      'product_page_url',
      'Product Page URL',
      'Product Page Url',
      'Page URL',
      'URL',
    ]);
    if (nextIdColumn !== undefined && nextUrlColumn !== undefined) {
      worksheet = candidate;
      idColumn = nextIdColumn;
      urlColumn = nextUrlColumn;
      break;
    }
  }

  if (!worksheet || idColumn === undefined || urlColumn === undefined) {
    return { path: filePath, loaded: false, byProductId };
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const productId = normalizeLookupProductId(cellText(row.getCell(idColumn)));
    const pagePath = toProductPagePath(cellText(row.getCell(urlColumn)));
    if (!productId || !pagePath || byProductId.has(productId)) continue;
    byProductId.set(productId, pagePath);
  }

  return { path: filePath, loaded: true, byProductId };
};

export const buildImagesFromLookupUrls = (
  urls: string[],
): Array<{ url: string; isPrimary: boolean; sortOrder: number }> =>
  urls.map((url, index) => ({
    url,
    isPrimary: index === 0,
    sortOrder: index,
  }));
