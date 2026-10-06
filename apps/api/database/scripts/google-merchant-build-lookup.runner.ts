/**
 * One-time / ops: rebuild google-merchant-id-lookup.json from the legacy Merchant xlsx.
 * Does NOT modify google-merchant-data.xlsx.
 *
 *   npm run google-merchant:build-lookup
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { extractExternalProductIdFromSheetId } from '../../../../modules/google-merchant/utils/google-merchant-id.util';

const SOURCE = path.resolve(
  process.cwd(),
  'docs/Master-Data-Sheets/google-merchant-data.xlsx',
);
const OUT = path.resolve(
  process.cwd(),
  'modules/google-merchant/data/google-merchant-id-lookup.json',
);

async function run(): Promise<void> {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source sheet not found: ${SOURCE}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no sheets');

  const byExternalProductId: Record<string, string> = {};
  let sourceRows = 0;
  let skipped = 0;
  let duplicatesIgnored = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw = String(row.getCell(1).value ?? '').trim();
    if (!raw) return;
    sourceRows += 1;

    const productId = extractExternalProductIdFromSheetId(raw);
    if (!productId) {
      skipped += 1;
      return;
    }

    const sheetId = raw.replace(/\s+/g, '').replace(/-+/g, '-');
    if (byExternalProductId[productId]) {
      duplicatesIgnored += 1;
      return;
    }
    byExternalProductId[productId] = sheetId;
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'docs/Master-Data-Sheets/google-merchant-data.xlsx',
        stats: {
          sourceRows,
          mapped: Object.keys(byExternalProductId).length,
          skipped,
          duplicatesIgnored,
        },
        byExternalProductId,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `[google-merchant:build-lookup] wrote ${OUT} mapped=${Object.keys(byExternalProductId).length} skipped=${skipped} dups=${duplicatesIgnored}`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[google-merchant:build-lookup] failed:', error);
    process.exit(1);
  });
