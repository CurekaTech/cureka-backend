import { access } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import * as ExcelJS from 'exceljs';

const DEFAULT_MANUFACTURER_LOOKUP_FILE = 'docs/Manufacture details (1).xlsx';
const DEFAULT_IMAGE_LOOKUP_FILE = 'docs/wc-product-export-6-7-2026-1783309274325.xlsx';

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
 * Import stores names as `Address [Product ID]` (one manufacturer per sheet row).
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
 * WC product export sheet: ID → ordered image URLs (comma-separated).
 * First URL is primary; remaining URLs are gallery.
 */
export const loadImageUrlsByProductId = async (
  filePath = resolveLookupPath(
    process.env['BULK_UPLOAD_IMAGE_LOOKUP_FILE'],
    DEFAULT_IMAGE_LOOKUP_FILE,
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

export const buildImagesFromLookupUrls = (
  urls: string[],
): Array<{ url: string; isPrimary: boolean; sortOrder: number }> =>
  urls.map((url, index) => ({
    url,
    isPrimary: index === 0,
    sortOrder: index,
  }));
