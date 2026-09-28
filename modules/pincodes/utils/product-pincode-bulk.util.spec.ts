import * as ExcelJS from 'exceljs';
import { parseProductPincodeSheet } from './product-pincode-bulk.util';

async function xlsxBuffer(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Pincodes');
  for (const row of rows) {
    sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseProductPincodeSheet', () => {
  it('reads a header and ignores duplicate codes', async () => {
    const buffer = await xlsxBuffer([['Pincode'], ['380001'], ['380001'], ['560001']]);
    await expect(parseProductPincodeSheet('pincodes.xlsx', buffer)).resolves.toEqual([
      '380001',
      '560001',
    ]);
  });

  it('reads a sheet that has no header', async () => {
    const buffer = await xlsxBuffer([['380001'], ['110001']]);
    await expect(parseProductPincodeSheet('pincodes.xlsx', buffer)).resolves.toEqual([
      '380001',
      '110001',
    ]);
  });

  it('reads a csv column', async () => {
    const buffer = Buffer.from('Pincode\n380001\n560001\n', 'utf8');
    await expect(parseProductPincodeSheet('pincodes.csv', buffer)).resolves.toEqual([
      '380001',
      '560001',
    ]);
  });

  it('rejects a code that is not 6 digits', async () => {
    const buffer = await xlsxBuffer([['Pincode'], ['38000']]);
    await expect(parseProductPincodeSheet('pincodes.xlsx', buffer)).rejects.toThrow(
      'Invalid pincodes: row 2 (38000)',
    );
  });

  it('rejects an empty sheet', async () => {
    const buffer = await xlsxBuffer([['Pincode']]);
    await expect(parseProductPincodeSheet('pincodes.xlsx', buffer)).rejects.toThrow(
      'The sheet has no pincodes.',
    );
  });
});
