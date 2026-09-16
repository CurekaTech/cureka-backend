/**
 * Mark variants as Out-Of-Stock from the OOS-Beta.xlsx sheet.
 *
 * Matches sheet SKU column → product_variants.sku and sets out_of_stock = true.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:oos-update
 *   npm run product:oos-update -- --file="docs/Master-Data-Sheets/OOS-Beta.xlsx" --apply
 *   npm run product:oos-update -- --apply --limit=50
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/OOS-Beta.xlsx';

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
  sheet?: string;
}

interface SheetRow {
  sku: string;
}

interface Target {
  variantId: string;
  productId: string;
  sku: string;
  alreadyOos: boolean;
}

const absolutePath = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.cwd(), p);

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return (v).richText.map((r) => r.text).join('').trim();
  }
  return String(v).trim();
};

const printUsage = (): void => {
  console.log(`
product:oos-update — Mark variants Out-Of-Stock from a sheet

Options:
  --file <path>     XLSX file  (default: ${DEFAULT_FILE})
  --sheet <name>    Worksheet name (default: first sheet)
  --apply           Persist changes to DB (default: dry-run)
  --limit <n>       Process at most N variants
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { file: DEFAULT_FILE, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0); }
    if (arg === '--apply') { opts.apply = true; continue; }
    if (arg === '--file' || arg.startsWith('--file=')) {
      opts.file = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? opts.file;
      continue;
    }
    if (arg === '--sheet' || arg.startsWith('--sheet=')) {
      opts.sheet = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw = arg.includes('=') ? arg.split('=')[1] : argv[++i];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) opts.limit = Math.trunc(n);
      continue;
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

  // Detect column index for SKU (case-insensitive)
  let skuCol = 0;
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase();
    if (header === 'sku') skuCol = colNumber;
  });

  if (!skuCol) {
    throw new Error(
      `Could not find "SKU" column in sheet "${worksheet.name}". ` +
      `Found headers: ${(worksheet.getRow(1).values as (string | undefined)[])?.slice(1).filter(Boolean).join(', ')}`,
    );
  }

  console.log(`[oos-update] SKU column index=${skuCol} in sheet "${worksheet.name}"`);

  const rows: SheetRow[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const sku = normalizeText(row.getCell(skuCol));
    if (!sku) continue;
    rows.push({ sku });
  }
  return rows;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`[oos-update] file=${filePath}`);
  console.log(`[oos-update] apply=${opts.apply}${opts.limit ? ` limit=${opts.limit}` : ''}`);

  const sheetRows = await readSheet(filePath, opts.sheet);
  if (!sheetRows.length) throw new Error('Sheet is empty or has no valid SKU rows');
  console.log(`[oos-update] sheet rows with SKU=${sheetRows.length}`);

  const skuSet = new Set(sheetRows.map((r) => r.sku));

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);

    // Load all variants whose SKU matches anything in the sheet
    const allVariants = await variantRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.productId', 'v.sku', 'v.outOfStock'])
      .where('v.deleted_at IS NULL')
      .getMany();

    const targets: Target[] = [];
    const sheetSkusNotFound: string[] = [];

    for (const sku of skuSet) {
      const match = allVariants.find(
        (v) => v.sku.trim().toLowerCase() === sku.toLowerCase(),
      );
      if (!match) {
        sheetSkusNotFound.push(sku);
        continue;
      }
      targets.push({
        variantId: match.id,
        productId: match.productId,
        sku: match.sku,
        alreadyOos: match.outOfStock,
      });
    }

    const limited = opts.limit ? targets.slice(0, opts.limit) : targets;
    const toUpdate = limited.filter((t) => !t.alreadyOos);
    const alreadyDone = limited.filter((t) => t.alreadyOos);

    console.log(`[oos-update] matched=${limited.length} toUpdate=${toUpdate.length} alreadyOOS=${alreadyDone.length} notFoundInDB=${sheetSkusNotFound.length}`);

    if (sheetSkusNotFound.length) {
      console.log(
        `[oos-update] SKUs in sheet but not in DB (first 30):`,
        sheetSkusNotFound.slice(0, 30),
      );
    }

    if (!opts.apply) {
      const sample = toUpdate.slice(0, 20).map((t) => ({
        sku: t.sku,
        variantId: t.variantId,
        action: 'set outOfStock=true',
      }));
      console.log('[oos-update] dry-run sample:', JSON.stringify(sample, null, 2));
      console.log(`[oos-update] dry-run complete — re-run with --apply to persist`);
      return;
    }

    if (!toUpdate.length) {
      console.log('[oos-update] nothing to update — all matched variants are already OOS');
      return;
    }

    // Batch update in chunks of 500
    const chunkSize = 500;
    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
      const batch = toUpdate.slice(i, i + chunkSize);
      const ids = batch.map((t) => t.variantId);
      await variantRepo
        .createQueryBuilder()
        .update(ProductVariantEntity)
        .set({ outOfStock: true })
        .whereInIds(ids)
        .execute();
      updated += batch.length;
      console.log(`[oos-update] updated ${updated}/${toUpdate.length}`);
    }

    // Invalidate Redis cache for all touched products
    const uniqueProductIds = [...new Set(toUpdate.map((t) => t.productId))];
    // Fetch refIds for cache invalidation
    const products = await AppDataSource.query<Array<{ ref_id: string }>>(
      `SELECT ref_id FROM products WHERE id = ANY($1)`,
      [uniqueProductIds],
    );
    const cacheResult = await invalidateProductCache(
      products.map((p) => ({ refId: p.ref_id })),
      false,
    );

    console.log(
      `[oos-update] done updated=${updated} cacheKeysDeleted=${cacheResult.keysDeleted} redis=${cacheResult.connected}`,
    );
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[oos-update] failed:', error);
    process.exit(1);
  });
