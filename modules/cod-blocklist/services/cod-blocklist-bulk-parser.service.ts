import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { validateStrictBulkIndianMobile } from '../utils/bulk-mobile-number.util';
import {
  parseIsActiveCell,
  resolveCodBulkColumnKey,
} from '../utils/cod-blocklist-bulk-columns.util';
import { isValidIndianPincode, normalizePincode } from '../utils/pincode.util';

export interface IParsedCodBulkRow {
  rowNumber: number;
  pincode?: string;
  mobileNumber?: string;
  isActive: boolean;
  reason?: string;
}

export interface ICodBulkRowError {
  rowNumber: number;
  sku: string;
  column: string;
  invalidValue: string;
  reason: string;
  suggestedFix: string;
}

export interface IParsedCodBulkSheet {
  rows: IParsedCodBulkRow[];
  errors: ICodBulkRowError[];
}

const normalizeText = (cell: ExcelJS.CellValue | undefined | null): string => {
  if (cell == null) return '';
  if (typeof cell === 'object' && cell && 'richText' in cell) {
    return (cell as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim();
  }
  if (typeof cell === 'object' && cell && 'result' in cell) {
    return normalizeText((cell as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return String(cell);
    // Reject non-integers (floats) by preserving a decimal form for validators.
    if (!Number.isInteger(cell)) return String(cell);
    // Avoid scientific notation for large phone numbers stored as Excel numbers.
    return cell.toFixed(0);
  }
  return String(cell).trim();
};

@Injectable()
export class CodBlocklistBulkParserService {
  async parseFile(filePath: string): Promise<IParsedCodBulkSheet> {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.csv')) {
      return this.parseCsv(filePath);
    }
    return this.parseXlsx(filePath);
  }

  private async parseXlsx(filePath: string): Promise<IParsedCodBulkSheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('No worksheet found in the uploaded file');
    }

    const colMap: Record<string, number> = {};
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = resolveCodBulkColumnKey(normalizeText(cell.value));
      if (key) colMap[key] = colNumber;
    });
    this.assertRequiredColumns(colMap);

    const rows: IParsedCodBulkRow[] = [];
    const errors: ICodBulkRowError[] = [];
    const seenKeys = new Map<string, number>();

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const pincode = colMap.pincode ? normalizeText(row.getCell(colMap.pincode).value) : '';
      const mobileNumber = colMap.mobileNumber
        ? normalizeText(row.getCell(colMap.mobileNumber).value)
        : '';
      const isActiveRaw = normalizeText(row.getCell(colMap.isActive).value);
      const reason = colMap.reason ? normalizeText(row.getCell(colMap.reason).value) : '';

      if (!pincode && !mobileNumber && !isActiveRaw && !reason) continue;

      this.validateAndPush(
        { rowNumber: r, pincode, mobileNumber, isActiveRaw, reason },
        rows,
        errors,
        seenKeys,
      );
    }

    return { rows, errors };
  }

  private async parseCsv(filePath: string): Promise<IParsedCodBulkSheet> {
    const lineReader = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let rowNumber = 0;
    let colMap: Record<string, number> | null = null;
    const rows: IParsedCodBulkRow[] = [];
    const errors: ICodBulkRowError[] = [];
    const seenKeys = new Map<string, number>();

    for await (const line of lineReader) {
      rowNumber += 1;
      const cells = this.splitCsvLine(line);
      if (!colMap) {
        colMap = {};
        cells.forEach((header, index) => {
          const key = resolveCodBulkColumnKey(header);
          if (key) colMap![key] = index;
        });
        this.assertRequiredColumns(colMap);
        continue;
      }

      const get = (key: string): string => {
        const idx = colMap![key];
        return idx == null ? '' : String(cells[idx] ?? '').trim();
      };

      const pincode = get('pincode');
      const mobileNumber = get('mobileNumber');
      const isActiveRaw = get('isActive');
      const reason = get('reason');
      if (!pincode && !mobileNumber && !isActiveRaw && !reason) continue;

      this.validateAndPush(
        { rowNumber, pincode, mobileNumber, isActiveRaw, reason },
        rows,
        errors,
        seenKeys,
      );
    }

    if (!colMap) {
      throw new BadRequestException('CSV file is empty');
    }

    return { rows, errors };
  }

  private assertRequiredColumns(colMap: Record<string, number>): void {
    if (colMap.isActive == null) {
      throw new BadRequestException(
        'Missing required column: Is Active. Expected: Pincode, Mobile Number, Is Active, Reason',
      );
    }
    if (colMap.pincode == null && colMap.mobileNumber == null) {
      throw new BadRequestException(
        'Missing identity columns. Expected at least one of: Pincode, Mobile Number',
      );
    }
  }

  private validateAndPush(
    input: {
      rowNumber: number;
      pincode: string;
      mobileNumber: string;
      isActiveRaw: string;
      reason: string;
    },
    rows: IParsedCodBulkRow[],
    errors: ICodBulkRowError[],
    seenKeys: Map<string, number>,
  ): void {
    const { rowNumber, pincode, mobileNumber, isActiveRaw, reason } = input;
    const identityLabel = pincode || mobileNumber || '';

    if ((pincode && mobileNumber) || (!pincode && !mobileNumber)) {
      errors.push({
        rowNumber,
        sku: identityLabel,
        column: 'Pincode / Mobile Number',
        invalidValue: `pincode=${pincode}; mobile=${mobileNumber}`,
        reason: 'Provide either Pincode or Mobile Number, not both',
        suggestedFix: 'Fill exactly one identity column per row',
      });
      return;
    }

    const isActive = parseIsActiveCell(isActiveRaw);
    if (isActive == null) {
      errors.push({
        rowNumber,
        sku: identityLabel,
        column: 'Is Active',
        invalidValue: isActiveRaw,
        reason: 'Is Active is required (Yes/No, true/false, 1/0, Active/Inactive)',
        suggestedFix: 'Set Is Active to Yes or No',
      });
      return;
    }

    let normalizedPincode: string | undefined;
    let normalizedMobile: string | undefined;

    if (pincode) {
      const pin = normalizePincode(pincode);
      if (!isValidIndianPincode(pin)) {
        errors.push({
          rowNumber,
          sku: identityLabel,
          column: 'Pincode',
          invalidValue: pincode,
          reason: 'Pincode must be a valid 6-digit Indian pincode',
          suggestedFix: 'Enter exactly 6 digits, e.g. 380015',
        });
        return;
      }
      normalizedPincode = pin;
    } else {
      const mobileResult = validateStrictBulkIndianMobile(mobileNumber);
      if (!mobileResult.ok) {
        errors.push({
          rowNumber,
          sku: identityLabel,
          column: 'Mobile Number',
          invalidValue: mobileNumber,
          reason: mobileResult.reason,
          suggestedFix: mobileResult.suggestedFix,
        });
        return;
      }
      normalizedMobile = mobileResult.mobileNumber;
    }

    const dedupeKey = normalizedPincode
      ? `pincode:${normalizedPincode}`
      : `mobile:${normalizedMobile}`;
    if (seenKeys.has(dedupeKey)) {
      errors.push({
        rowNumber,
        sku: identityLabel,
        column: normalizedPincode ? 'Pincode' : 'Mobile Number',
        invalidValue: identityLabel,
        reason: `Duplicate identity in sheet (also on row ${seenKeys.get(dedupeKey)})`,
        suggestedFix: 'Keep only one row per pincode or mobile number',
      });
      return;
    }
    seenKeys.set(dedupeKey, rowNumber);

    rows.push({
      rowNumber,
      pincode: normalizedPincode,
      mobileNumber: normalizedMobile,
      isActive,
      reason: reason || undefined,
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
