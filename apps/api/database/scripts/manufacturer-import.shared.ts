import * as ExcelJS from 'exceljs';
import { randomBytes } from 'crypto';
<<<<<<< HEAD
import { generateUniqueRefId, generateRefId } from '@packages/common';
=======
import { generateUniqueRefId } from '@packages/common';
>>>>>>> ba0e083 (feat: add manufacturer address import and reset scripts to streamline manufacturer data management)
import { ManufacturerEntity } from '../../../../modules/master/entities/manufacturer.entity';
import { Repository } from 'typeorm';

export const TEST_MANUFACTURER_NAME = 'test_manufacture';

export const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

<<<<<<< HEAD
/** Strips punctuation so minor title differences still match. */
export const normalizeLooseName = (value: string): string =>
  normalizeText(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Normalizes legacy numeric IDs from Excel (e.g. 16794, "16794.0"). */
export const normalizeExternalId = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return String(Math.trunc(asNumber));
  }
  return normalizeText(trimmed);
};

=======
>>>>>>> ba0e083 (feat: add manufacturer address import and reset scripts to streamline manufacturer data management)
export const normalizeHeader = (value: string): string =>
  normalizeText(value).replace(/[_-]+/g, ' ');

export const cellText = (cell: ExcelJS.Cell): string => {
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

/**
 * Builds a manufacturer code in the format: PREFIX + YEAR + 4-digit number.
 *
 * Format:
 *   [3-letter prefix from name][4-digit year][4-digit random]
 *
 * @example
 *   generateMasterCode('Pregnancy Glow') // → 'PRE20261356'
 *   generateMasterCode('3M India')       // → 'MIN20268042'
 */
export const generateMasterCode = (name: string): string => {
  const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const prefix = (letters.slice(0, 3) || 'MFG').padEnd(3, 'X');
  const year = new Date().getFullYear();
  const bytes = randomBytes(2);
  const number = ((bytes[0]! << 8) | bytes[1]!) % 10000;
  const sequence = number.toString().padStart(4, '0');
  return `${prefix}${year}${sequence}`;
};

export const generateUniqueManufacturerCode = async (
  repo: Repository<ManufacturerEntity>,
  name: string,
): Promise<string> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = generateMasterCode(name);
    const count = await repo.count({ where: { code } });
    if (count === 0) {
      return code;
    }
  }

  throw new Error(`Failed to generate unique manufacturer code for "${name}".`);
};

export const generateUniqueManufacturerRefId = async (
  repo: Repository<ManufacturerEntity>,
  name: string,
): Promise<string> =>
  generateUniqueRefId(name, async (refId) => (await repo.count({ where: { refId } })) > 0);

<<<<<<< HEAD
export const loadManufacturerCodeRefIdSets = async (
  repo: Repository<ManufacturerEntity>,
): Promise<{ codes: Set<string>; refIds: Set<string> }> => {
  const rows = await repo
    .createQueryBuilder('manufacturer')
    .select(['manufacturer.code', 'manufacturer.refId'])
    .withDeleted()
    .getMany();

  return {
    codes: new Set(rows.map((row) => row.code)),
    refIds: new Set(rows.map((row) => row.refId)),
  };
};

export const reserveUniqueManufacturerCode = (
  name: string,
  codes: Set<string>,
): string => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = generateMasterCode(name);
    if (!codes.has(code)) {
      codes.add(code);
      return code;
    }
  }
  throw new Error(`Failed to reserve unique manufacturer code for "${name}".`);
};

export const reserveUniqueManufacturerRefId = (
  name: string,
  refIds: Set<string>,
): string => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const refId = generateRefId(name);
    if (!refIds.has(refId)) {
      refIds.add(refId);
      return refId;
    }
  }
  throw new Error(`Failed to reserve unique manufacturer refId for "${name}".`);
};

=======
>>>>>>> ba0e083 (feat: add manufacturer address import and reset scripts to streamline manufacturer data management)
export const getHeaderIndex = (
  headers: Map<string, number>,
  aliases: string[],
): number | undefined => {
  for (const alias of aliases) {
    const index = headers.get(normalizeHeader(alias));
    if (index !== undefined) return index;
  }
  return undefined;
};

export interface ManufacturerSheetRow {
  rowNumber: number;
  id: string;
  sku: string;
  name: string;
  address: string;
}

export const readManufacturerSheetRows = async (
  filePath: string,
  sheetName?: string,
): Promise<ManufacturerSheetRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(
      sheetName
        ? `Worksheet "${sheetName}" was not found.`
        : 'The workbook does not contain a worksheet.',
    );
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header) headers.set(header, columnNumber);
  });

  const idColumn = getHeaderIndex(headers, ['ID', 'Product ID', 'External Product ID']);
  const skuColumn = getHeaderIndex(headers, ['SKU', 'SKU Code', 'Sku']);
  const nameColumn = getHeaderIndex(headers, [
    'Name',
    'Product Name',
    'Manufacturer Name',
    'Manufacture Name',
    'Manufacturer',
  ]);
  const addressColumn = getHeaderIndex(headers, [
    'Manufacture Address',
    'Manufacturer Address',
    'Manufacturing Address',
    'Address',
  ]);

  if (nameColumn === undefined && skuColumn === undefined && idColumn === undefined) {
    throw new Error('Missing identifier column. Expected "ID", "SKU", or "Name".');
  }
  if (addressColumn === undefined) {
    throw new Error(
      'Missing address column. Expected "Manufacture Address" or "Manufacturer Address".',
    );
  }

  const rows: ManufacturerSheetRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const parsed: ManufacturerSheetRow = {
      rowNumber,
      id: idColumn === undefined ? '' : cellText(row.getCell(idColumn)),
      sku: skuColumn === undefined ? '' : cellText(row.getCell(skuColumn)),
      name: nameColumn === undefined ? '' : cellText(row.getCell(nameColumn)),
      address: cellText(row.getCell(addressColumn)),
    };

    if (parsed.id || parsed.sku || parsed.name || parsed.address) {
      rows.push(parsed);
    }
  }

  return rows;
};

export const findManufacturerByName = async (
  repo: Repository<ManufacturerEntity>,
  name: string,
): Promise<ManufacturerEntity | null> =>
  repo
    .createQueryBuilder('manufacturer')
    .where('LOWER(TRIM(manufacturer.name)) = LOWER(TRIM(:name))', { name })
    .andWhere('manufacturer.deletedAt IS NULL')
    .getOne();
