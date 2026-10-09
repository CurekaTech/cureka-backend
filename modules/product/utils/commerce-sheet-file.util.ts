import { BadRequestException } from '@nestjs/common';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import * as ExcelJS from 'exceljs';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { createInterface } from 'readline';
import { join } from 'path';
import { Repository } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { ICommerceRowError } from './commerce-sheet.util';

export interface ISheetTable {
  headers: string[];
  rows: Array<{ rowNumber: number; cells: string[] }>;
}

export function cellText(cell: ExcelJS.CellValue | undefined | null): string {
  if (cell == null) return '';
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  if (typeof cell === 'object' && 'richText' in cell) {
    return cell.richText.map((part) => part.text).join('').trim();
  }
  if (typeof cell === 'object' && 'result' in cell) {
    return cellText(cell.result as ExcelJS.CellValue);
  }
  if (typeof cell === 'object' && 'text' in cell && typeof cell.text === 'string') {
    return cell.text.trim();
  }
  return String(cell).trim();
}

export async function readTabularSheet(filePath: string): Promise<ISheetTable> {
  if (filePath.toLowerCase().endsWith('.csv')) return readCsv(filePath);
  return readXlsx(filePath);
}

async function readXlsx(filePath: string): Promise<ISheetTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new BadRequestException('No worksheet found in the uploaded file');

  const headerRow = worksheet.getRow(1);
  let lastColumn = 0;
  headerRow.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
    lastColumn = Math.max(lastColumn, colNumber);
  });
  const headers: string[] = [];
  for (let col = 1; col <= lastColumn; col += 1) {
    headers.push(cellText(headerRow.getCell(col).value));
  }

  const rows: ISheetTable['rows'] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cells = headers.map((_header, index) => cellText(row.getCell(index + 1).value));
    rows.push({ rowNumber, cells });
  }
  return { headers, rows };
}

async function readCsv(filePath: string): Promise<ISheetTable> {
  const lineReader = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;
  const rows: ISheetTable['rows'] = [];
  let rowNumber = 0;
  for await (const line of lineReader) {
    rowNumber += 1;
    const cells = splitCsvLine(line);
    if (!headers) {
      headers = cells;
      continue;
    }
    rows.push({ rowNumber, cells });
  }
  if (!headers) throw new BadRequestException('CSV file is empty');
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

export async function uploadCommerceErrorWorkbook(
  storageService: StorageService,
  uploadRefId: string,
  errors: ICommerceRowError[],
  folder: string,
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Upload Errors');
  worksheet.columns = [
    { header: 'Row Number', key: 'rowNumber', width: 14 },
    { header: 'SKU', key: 'sku', width: 24 },
    { header: 'Column Name', key: 'column', width: 22 },
    { header: 'Invalid Value', key: 'invalidValue', width: 30 },
    { header: 'Error Reason', key: 'reason', width: 50 },
    { header: 'Suggested Fix', key: 'suggestedFix', width: 45 },
  ];
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4F81BD' } };
  });
  for (const error of errors) {
    worksheet.addRow(error);
  }

  const errorReportDir = join(process.cwd(), 'temp-uploads');
  await mkdir(errorReportDir, { recursive: true });
  const errorReportPath = join(errorReportDir, `errors-${uploadRefId}-${Date.now()}.xlsx`);
  try {
    await workbook.xlsx.writeFile(errorReportPath);
    const uploadRes = await storageService.uploadImage({
      stream: createReadStream(errorReportPath),
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalFilename: `errors-${uploadRefId}.xlsx`,
      folder,
    });
    return uploadRes.path;
  } finally {
    try {
      await unlink(errorReportPath);
    } catch {
      // The local error workbook is only a staging file.
    }
  }
}

export async function invalidateTouchedProductCaches(
  cacheStrategy: CacheStrategyService,
  productRepo: Repository<ProductEntity>,
  productIds: string[],
): Promise<{ failed: boolean; refIds: string[] }> {
  if (!productIds.length) return { failed: false, refIds: [] };
  const products = await productRepo
    .createQueryBuilder('p')
    .select(['p.id', 'p.refId'])
    .where('p.id IN (:...ids)', { ids: productIds })
    .getMany();
  const refIds = products.map((product) => product.refId).filter(Boolean);
  try {
    await cacheStrategy.invalidateOnly({
      keys: products.map((product) => CacheKeys.products.detail(product.refId)),
      patterns: [
        CacheKeys.products.listPattern(),
        CacheKeys.publicProducts.listPattern(),
        CacheKeys.publicProducts.variantSearchPattern(),
        CacheKeys.publicProducts.detailPattern(),
        ...CacheKeys.publicProducts.recommendationPatterns(),
      ],
    });
    return { failed: false, refIds: [] };
  } catch {
    return { failed: true, refIds };
  }
}

export async function downloadStoredFile(
  storageService: StorageService,
  fileUrl: string,
  tempDirName: string,
  uploadRefId: string,
): Promise<string> {
  const tempDir = join(process.cwd(), 'tmp', tempDirName);
  const tempFilePath = join(tempDir, `${uploadRefId}-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  const readStream = await storageService.createReadStream(fileUrl);
  const { pipeline } = await import('stream/promises');
  await pipeline(readStream, createWriteStream(tempFilePath));
  return tempFilePath;
}
