import { BadRequestException, Injectable } from '@nestjs/common';
import { resolveReturnColumnKey, ReturnColumnKey } from '../utils/bulk-return-update-columns.util';
import {
  ICommerceRowError,
  IReturnWrite,
  collapseIdenticalSkuRows,
  normalizeReturnWrite,
  parseOptionalNonNegativeInt,
  parseSheetBoolean,
  returnWriteKey,
} from '../utils/commerce-sheet.util';
import { readTabularSheet } from '../utils/commerce-sheet-file.util';

export interface IParsedReturnRow extends IReturnWrite {
  rowNumber: number;
  sku: string;
}

export interface IParsedReturnSheet {
  rows: IParsedReturnRow[];
  errors: ICommerceRowError[];
  identicalDuplicateRows: number;
  totalDataRows: number;
}

@Injectable()
export class BulkReturnUpdateParserService {
  async parseFile(filePath: string): Promise<IParsedReturnSheet> {
    const table = await readTabularSheet(filePath);
    const colMap: Partial<Record<ReturnColumnKey, number>> = {};
    table.headers.forEach((header, index) => {
      const key = resolveReturnColumnKey(header);
      if (key && colMap[key] == null) colMap[key] = index;
    });

    const required: Array<[ReturnColumnKey, string]> = [
      ['sku', 'SKU'],
      ['returnAllowed', 'returnAllowed'],
      ['replaceAllowed', 'replaceAllowed'],
      ['refundAllowed', 'refundAllowed'],
    ];
    const missing = required.filter(([key]) => colMap[key] == null).map(([, label]) => label);
    if (missing.length) {
      throw new BadRequestException(
        `Missing required columns: ${missing.join(', ')}. Expected: SKU, returnAllowed, returnPolicy, returnWindowDays, replaceAllowed, replaceWindowDays, refundAllowed`,
      );
    }

    const candidates: IParsedReturnRow[] = [];
    const errors: ICommerceRowError[] = [];
    let totalDataRows = 0;
    const cell = (rowCells: string[], key: ReturnColumnKey) => {
      const index = colMap[key];
      return index == null ? '' : (rowCells[index] ?? '');
    };

    for (const row of table.rows) {
      const sku = cell(row.cells, 'sku');
      const returnAllowedRaw = cell(row.cells, 'returnAllowed');
      const returnPolicyRaw = cell(row.cells, 'returnPolicy');
      const returnWindowRaw = cell(row.cells, 'returnWindowDays');
      const replaceAllowedRaw = cell(row.cells, 'replaceAllowed');
      const replaceWindowRaw = cell(row.cells, 'replaceWindowDays');
      const refundAllowedRaw = cell(row.cells, 'refundAllowed');
      if (
        !sku &&
        !returnAllowedRaw &&
        !returnPolicyRaw &&
        !returnWindowRaw &&
        !replaceAllowedRaw &&
        !replaceWindowRaw &&
        !refundAllowedRaw
      ) {
        continue;
      }
      totalDataRows += 1;

      if (!sku) {
        errors.push(this.rowError(row.rowNumber, '', 'SKU', '', 'SKU is required', 'Provide the exact variant SKU'));
        continue;
      }

      const returnAllowed = parseSheetBoolean(returnAllowedRaw);
      const replaceAllowed = parseSheetBoolean(replaceAllowedRaw);
      const refundAllowed = parseSheetBoolean(refundAllowedRaw);
      if (returnAllowed == null || replaceAllowed == null || refundAllowed == null) {
        const invalid = returnAllowed == null
          ? ['returnAllowed', returnAllowedRaw]
          : replaceAllowed == null
            ? ['replaceAllowed', replaceAllowedRaw]
            : ['refundAllowed', refundAllowedRaw];
        errors.push(
          this.rowError(
            row.rowNumber,
            sku,
            invalid[0],
            invalid[1],
            `${invalid[0]} must be true, false, yes, or no`,
            'Use true/false or yes/no. Other values are not stored as false.',
          ),
        );
        continue;
      }

      const returnWindowDays = parseOptionalNonNegativeInt(returnWindowRaw);
      const replaceWindowDays = parseOptionalNonNegativeInt(replaceWindowRaw);
      if (returnWindowDays === 'invalid' || replaceWindowDays === 'invalid') {
        const invalidWindow = returnWindowDays === 'invalid';
        errors.push(
          this.rowError(
            row.rowNumber,
            sku,
            invalidWindow ? 'returnWindowDays' : 'replaceWindowDays',
            invalidWindow ? returnWindowRaw : replaceWindowRaw,
            'Window must be empty or a non-negative integer',
            'Leave the cell empty or enter a whole number of days, 0 or greater',
          ),
        );
        continue;
      }

      candidates.push({
        rowNumber: row.rowNumber,
        sku,
        ...normalizeReturnWrite({
          returnAllowed,
          returnPolicy: returnPolicyRaw.trim() || null,
          returnWindowDays,
          replaceAllowed,
          replaceWindowDays,
          refundAllowed,
        }),
      });
    }

    const collapsed = collapseIdenticalSkuRows(
      candidates,
      (row) => row.sku,
      (left, right) => returnWriteKey(left) === returnWriteKey(right),
    );
    for (const row of collapsed.conflicts) {
      errors.push(
        this.rowError(
          row.rowNumber,
          row.sku,
          'SKU',
          row.sku,
          'Conflicting return or replacement values for the same SKU',
          'Keep one set of return, replacement, and refund values for this SKU',
        ),
      );
    }

    return {
      rows: collapsed.rows,
      errors,
      identicalDuplicateRows: collapsed.identicalDuplicateRows,
      totalDataRows,
    };
  }

  private rowError(
    rowNumber: number,
    sku: string,
    column: string,
    invalidValue: string,
    reason: string,
    suggestedFix: string,
  ): ICommerceRowError {
    return { rowNumber, sku, column, invalidValue, reason, suggestedFix };
  }
}
