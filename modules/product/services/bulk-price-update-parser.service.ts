import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolvePriceColumnKey } from '../utils/bulk-price-update-columns.util';
import { normalizeSkuMatchKey } from '../utils/sku-match.util';

export interface IParsedPriceRow {
  rowNumber: number;
  sku: string;
  productId?: string;
  mrp: number;
  sellingPrice: number;
}

export interface IPriceRowError {
  rowNumber: number;
  sku: string;
  column: string;
  invalidValue: string;
  reason: string;
  suggestedFix: string;
}

export interface IParsedPriceSheet {
  rows: IParsedPriceRow[];
  errors: IPriceRowError[];
}

const normalizeText = (cell: ExcelJS.CellValue | undefined | null): string => {
  if (cell == null) return '';
  if (typeof cell === 'object' && cell && 'richText' in cell) {
    return (cell as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim();
  }
  if (typeof cell === 'object' && cell && 'result' in cell) {
    return String((cell as ExcelJS.CellFormulaValue).result ?? '').trim();
  }
  return String(cell).trim();
};

const parsePositiveNumber = (raw: string): number | null => {
  if (!raw.trim()) return null;
  const cleaned = raw.replace(/,/g, '').trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
};

@Injectable()
export class BulkPriceUpdateParserService {
  async parseFile(filePath: string): Promise<IParsedPriceSheet> {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.csv')) {
      return this.parseCsv(filePath);
    }
    return this.parseXlsx(filePath);
  }

  private async parseXlsx(filePath: string): Promise<IParsedPriceSheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('No worksheet found in the uploaded file');
    }

    const colMap: Record<string, number> = {};
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = resolvePriceColumnKey(normalizeText(cell.value));
      if (key) colMap[key] = colNumber;
    });

    this.assertRequiredColumns(colMap);

    const rows: IParsedPriceRow[] = [];
    const errors: IPriceRowError[] = [];
    const seenSkus = new Map<string, number>();

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const sku = normalizeText(row.getCell(colMap.sku).value);
      const productId = colMap.productId
        ? normalizeText(row.getCell(colMap.productId).value)
        : '';
      const mrpRaw = normalizeText(row.getCell(colMap.mrp).value);
      const sellingRaw = normalizeText(row.getCell(colMap.sellingPrice).value);

      if (!sku && !productId && !mrpRaw && !sellingRaw) continue;

      this.validateAndPushRow(
        { rowNumber: r, sku, productId, mrpRaw, sellingRaw },
        rows,
        errors,
        seenSkus,
      );
    }

    return { rows, errors };
  }

  private async parseCsv(filePath: string): Promise<IParsedPriceSheet> {
    const lineReader = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let rowNumber = 0;
    let colMap: Record<string, number> | null = null;
    const rows: IParsedPriceRow[] = [];
    const errors: IPriceRowError[] = [];
    const seenSkus = new Map<string, number>();

    for await (const line of lineReader) {
      rowNumber += 1;
      const cells = this.splitCsvLine(line);
      if (!colMap) {
        colMap = {};
        cells.forEach((header, index) => {
          const key = resolvePriceColumnKey(header);
          if (key) colMap![key] = index;
        });
        this.assertRequiredColumns(colMap);
        continue;
      }

      const get = (key: string): string => {
        const idx = colMap![key];
        return idx == null ? '' : String(cells[idx] ?? '').trim();
      };

      const sku = get('sku');
      const productId = get('productId');
      const mrpRaw = get('mrp');
      const sellingRaw = get('sellingPrice');
      if (!sku && !productId && !mrpRaw && !sellingRaw) continue;

      this.validateAndPushRow(
        { rowNumber, sku, productId, mrpRaw, sellingRaw },
        rows,
        errors,
        seenSkus,
      );
    }

    if (!colMap) {
      throw new BadRequestException('CSV file is empty');
    }

    return { rows, errors };
  }

  private assertRequiredColumns(colMap: Record<string, number>): void {
    const missing: string[] = [];
    if (colMap.sku == null) missing.push('SKU');
    if (colMap.mrp == null) missing.push('MRP');
    if (colMap.sellingPrice == null) missing.push('Selling Price');
    if (missing.length) {
      throw new BadRequestException(
        `Missing required columns: ${missing.join(', ')}. Expected: SKU, Product Id (optional), MRP, Selling Price`,
      );
    }
  }

  private validateAndPushRow(
    input: {
      rowNumber: number;
      sku: string;
      productId: string;
      mrpRaw: string;
      sellingRaw: string;
    },
    rows: IParsedPriceRow[],
    errors: IPriceRowError[],
    seenSkus: Map<string, number>,
  ): void {
    const { rowNumber, sku, productId, mrpRaw, sellingRaw } = input;

    if (!sku) {
      errors.push({
        rowNumber,
        sku: '',
        column: 'SKU',
        invalidValue: '',
        reason: 'SKU is required',
        suggestedFix: 'Provide a valid variant SKU',
      });
      return;
    }

    const skuKey = normalizeSkuMatchKey(sku);
    if (seenSkus.has(skuKey)) {
      errors.push({
        rowNumber,
        sku,
        column: 'SKU',
        invalidValue: sku,
        reason: `Duplicate SKU in sheet (also on row ${seenSkus.get(skuKey)})`,
        suggestedFix: 'Keep only one row per SKU (matching is case-sensitive)',
      });
      return;
    }
    seenSkus.set(skuKey, rowNumber);

    const mrp = parsePositiveNumber(mrpRaw);
    if (mrp == null) {
      errors.push({
        rowNumber,
        sku,
        column: 'MRP',
        invalidValue: mrpRaw,
        reason: 'MRP is required and must be a number greater than 0',
        suggestedFix: 'Enter a positive MRP value',
      });
      return;
    }

    const sellingPrice = parsePositiveNumber(sellingRaw);
    if (sellingPrice == null) {
      errors.push({
        rowNumber,
        sku,
        column: 'Selling Price',
        invalidValue: sellingRaw,
        reason: 'Selling Price is required and must be a number greater than 0',
        suggestedFix: 'Enter a positive Selling Price value',
      });
      return;
    }

    if (sellingPrice > mrp) {
      errors.push({
        rowNumber,
        sku,
        column: 'Selling Price',
        invalidValue: String(sellingPrice),
        reason: `Selling Price (${sellingPrice}) cannot be greater than MRP (${mrp})`,
        suggestedFix: 'Set Selling Price less than or equal to MRP',
      });
      return;
    }

    rows.push({
      rowNumber,
      sku,
      productId: productId || undefined,
      mrp,
      sellingPrice,
    });
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
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
}
