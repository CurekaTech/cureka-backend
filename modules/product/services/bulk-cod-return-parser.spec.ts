import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import { BulkCodUpdateParserService } from './bulk-cod-update-parser.service';
import { BulkReturnUpdateParserService } from './bulk-return-update-parser.service';

async function writeSheet(rows: Array<Array<string | boolean>>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'commerce-sheet-'));
  const filePath = join(dir, 'sheet.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  for (const row of rows) sheet.addRow(row);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

describe('COD and return sheet parsers', () => {
  const files: string[] = [];

  afterAll(async () => {
    await Promise.all(files.map((filePath) => rm(join(filePath, '..'), { recursive: true, force: true })));
  });

  it('parses COD booleans, collapses identical SKUs, and rejects conflicts and invalid values', async () => {
    const filePath = await writeSheet([
      ['SKU', 'codAvailable'],
      ['HER/ZIN/08945', 'yes'],
      ['HER/ZIN/08945', 'TRUE'],
      ['her/zin/08945', false],
      ['BAD/SKU', 'maybe'],
    ]);
    files.push(filePath);

    const parsed = await new BulkCodUpdateParserService().parseFile(filePath);

    expect(parsed.identicalDuplicateRows).toBe(1);
    expect(parsed.rows).toEqual([
      { rowNumber: 2, sku: 'HER/ZIN/08945', codAvailable: true },
      { rowNumber: 4, sku: 'her/zin/08945', codAvailable: false },
    ]);
    expect(parsed.errors.map((error) => error.sku)).toEqual(['BAD/SKU']);
    expect(parsed.totalDataRows).toBe(4);
  });

  it('rejects every row when one SKU has two COD values', async () => {
    const filePath = await writeSheet([
      ['SKU', 'codAvailable'],
      ['ABC', 'true'],
      ['ABC', 'false'],
    ]);
    files.push(filePath);

    const parsed = await new BulkCodUpdateParserService().parseFile(filePath);
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toHaveLength(2);
  });

  it('normalizes disabled return fields and rejects a bad window', async () => {
    const filePath = await writeSheet([
      ['SKU', 'returnAllowed', 'returnPolicy', 'returnWindowDays', 'replaceAllowed', 'replaceWindowDays', 'refundAllowed'],
      ['HER/ZIN/08946', 'no', 'keep me', '9', 'no', '4', 'yes'],
      ['BAD/WIN', 'true', 'policy', '7.5', 'true', '', 'true'],
    ]);
    files.push(filePath);

    const parsed = await new BulkReturnUpdateParserService().parseFile(filePath);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        sku: 'HER/ZIN/08946',
        returnAllowed: false,
        returnPolicy: null,
        returnWindowDays: null,
        replaceAllowed: false,
        replaceWindowDays: null,
        refundAllowed: true,
      },
    ]);
    expect(parsed.errors[0]).toMatchObject({
      sku: 'BAD/WIN',
      column: 'returnWindowDays',
    });
  });
});
