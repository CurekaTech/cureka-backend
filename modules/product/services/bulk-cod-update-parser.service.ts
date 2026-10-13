import { BadRequestException, Injectable } from '@nestjs/common';
import { resolveCodColumnKey } from '../utils/bulk-cod-update-columns.util';
import {
  ICommerceRowError,
  collapseIdenticalSkuRows,
  parseSheetBoolean,
} from '../utils/commerce-sheet.util';
import { readTabularSheet } from '../utils/commerce-sheet-file.util';

export interface IParsedCodRow {
  rowNumber: number;
  sku: string;
  codAvailable: boolean;
}

export interface IParsedCodSheet {
  rows: IParsedCodRow[];
  errors: ICommerceRowError[];
  identicalDuplicateRows: number;
  totalDataRows: number;
}

@Injectable()
export class BulkCodUpdateParserService {
  async parseFile(filePath: string): Promise<IParsedCodSheet> {
    const table = await readTabularSheet(filePath);
    const colMap: Partial<Record<'sku' | 'codAvailable', number>> = {};
    table.headers.forEach((header, index) => {
      const key = resolveCodColumnKey(header);
      if (key && colMap[key] == null) colMap[key] = index;
    });
    const missing: string[] = [];
    if (colMap.sku == null) missing.push('SKU');
    if (colMap.codAvailable == null) missing.push('codAvailable');
    if (missing.length) {
      throw new BadRequestException(
        `Missing required columns: ${missing.join(', ')}. Expected: SKU, codAvailable`,
      );
    }

    const candidates: IParsedCodRow[] = [];
    const errors: ICommerceRowError[] = [];
    let totalDataRows = 0;

    for (const row of table.rows) {
      const sku = row.cells[colMap.sku!] ?? '';
      const rawFlag = row.cells[colMap.codAvailable!] ?? '';
      if (!sku && !rawFlag) continue;
      totalDataRows += 1;
      if (!sku) {
        errors.push({
          rowNumber: row.rowNumber,
          sku: '',
          column: 'SKU',
          invalidValue: '',
          reason: 'SKU is required',
          suggestedFix: 'Provide the exact variant SKU',
        });
        continue;
      }
      const codAvailable = parseSheetBoolean(rawFlag);
      if (codAvailable == null) {
        errors.push({
          rowNumber: row.rowNumber,
          sku,
          column: 'codAvailable',
          invalidValue: rawFlag,
          reason: 'codAvailable must be true, false, yes, or no',
          suggestedFix: 'Use true/false or yes/no. Other values are not stored as false.',
        });
        continue;
      }
      candidates.push({ rowNumber: row.rowNumber, sku, codAvailable });
    }

    const collapsed = collapseIdenticalSkuRows(
      candidates,
      (row) => row.sku,
      (left, right) => left.codAvailable === right.codAvailable,
    );
    for (const row of collapsed.conflicts) {
      errors.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        column: 'codAvailable',
        invalidValue: String(row.codAvailable),
        reason: 'Conflicting codAvailable values for the same SKU',
        suggestedFix: 'Keep one codAvailable value for this SKU',
      });
    }

    return {
      rows: collapsed.rows,
      errors,
      identicalDuplicateRows: collapsed.identicalDuplicateRows,
      totalDataRows,
    };
  }
}
