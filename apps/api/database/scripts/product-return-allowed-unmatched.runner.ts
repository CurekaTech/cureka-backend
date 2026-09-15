/**
 * Export Excel rows whose SKU Code is not present on any product variant.
 * Read-only — does not change returnAllowed / returnWindowDays.
 *
 * Usage:
 *   npm run product:return-allowed:unmatched
 *   npm run product:return-allowed:unmatched -- --out="docs/Master-Data-Sheets/no-returnable-products-unmatched-31.08.2026.csv"
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/no-returnable-products-31.08.2026.xlsx';
const DEFAULT_OUT = 'docs/Master-Data-Sheets/no-returnable-products-unmatched-31.08.2026.csv';

interface CliOptions {
  file: string;
  out: string;
  sheet?: string;
}

interface SheetRow {
  productName: string;
  id: string;
  sku: string;
}

const skuKey = (sku: string): string => sku.trim().toLowerCase();

const absolutePath = (p: string): string => (isAbsolute(p) ? p : resolve(process.cwd(), p));

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return (v).richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: string }).text).trim();
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : String(v).trim();
  }
  return String(v).trim();
};

const csvEscape = (value: string): string => {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
};

const printUsage = (): void => {
  console.log(`
product:return-allowed:unmatched — Export Excel SKUs not found on any variant (read-only)

Options:
  --file <path>   Source XLSX  (default: ${DEFAULT_FILE})
  --out <path>    Output CSV   (default: ${DEFAULT_OUT})
  --sheet <name>  Worksheet name (default: first sheet)
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { file: DEFAULT_FILE, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--file' || arg.startsWith('--file=')) {
      opts.file = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? opts.file;
      continue;
    }
    if (arg === '--out' || arg.startsWith('--out=')) {
      opts.out = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? opts.out;
      continue;
    }
    if (arg === '--sheet' || arg.startsWith('--sheet=')) {
      opts.sheet = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
    }
  }
  return opts;
};

const readSheet = async (filePath: string, sheetName?: string): Promise<SheetRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? (workbook.getWorksheet(sheetName) ?? workbook.worksheets[0])
    : workbook.worksheets[0];

  if (!worksheet) throw new Error(`No worksheet found in ${filePath}`);

  let nameCol = 0;
  let idCol = 0;
  let skuCol = 0;
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').replace(/\*$/, '').trim();
    if (header === 'product name') nameCol = colNumber;
    else if (header === 'id') idCol = colNumber;
    else if (header === 'sku code' || header === 'sku') skuCol = colNumber;
  });

  if (!skuCol) {
    const found = (worksheet.getRow(1).values as (string | undefined)[])
      ?.slice(1)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Could not find required column "SKU Code" in sheet "${worksheet.name}". Found: ${found}`,
    );
  }

  console.log(
    `[return-allowed] columns → "Product Name"=${nameCol || 'n/a'} ID=${idCol || 'n/a'} "SKU Code"=${skuCol} in sheet "${worksheet.name}"`,
  );

  const rows: SheetRow[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const sku = normalizeText(row.getCell(skuCol));
    if (!sku) continue;
    rows.push({
      productName: nameCol ? normalizeText(row.getCell(nameCol)) : '',
      id: idCol ? normalizeText(row.getCell(idCol)) : '',
      sku,
    });
  }
  return rows;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);
  const outPath = absolutePath(opts.out);

  console.log(`[return-allowed] file=${filePath}`);
  console.log(`[return-allowed] out=${outPath}`);

  const sheetRows = await readSheet(filePath, opts.sheet);
  if (!sheetRows.length) {
    throw new Error('Sheet is empty or has no rows with SKU Code');
  }

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);
    const variants = await variantRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.sku'])
      .where('v.deleted_at IS NULL')
      .getMany();

    const dbSkuKeys = new Set(
      variants.map((v) => skuKey(v.sku ?? '')).filter(Boolean),
    );

    const unmatched = sheetRows.filter((row) => !dbSkuKeys.has(skuKey(row.sku)));

    const lines = [
      'Product Name,ID,SKU Code',
      ...unmatched.map(
        (row) => `${csvEscape(row.productName)},${csvEscape(row.id)},${csvEscape(row.sku)}`,
      ),
    ];

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');

    console.log('[return-allowed] unmatched SKU export created:');
    console.log(outPath);
    console.log(`[return-allowed] Total unmatched Excel SKUs exported: ${unmatched.length}`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[return-allowed] unmatched export failed:', error);
    process.exit(1);
  });
