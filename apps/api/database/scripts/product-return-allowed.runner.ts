/**
 * Set variant return policy from the no-returnable-products Excel sheet.
 *
 * Sheet columns:
 *   ID        → variant.external_product_id
 *   SKU Code  → variant.sku
 *
 * A variant is non-returnable only when BOTH fields match the same sheet row.
 * Matching variants:  returnAllowed = false; returnWindowDays left unchanged.
 * All other variants: returnAllowed = true;  returnWindowDays = 2.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:return-allowed
 *   npm run product:return-allowed -- --apply
 *   npm run product:return-allowed -- --file="docs/Master-Data-Sheets/no-returnable-products-31.08.2026.xlsx" --apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/no-returnable-products-31.08.2026.xlsx';
const RETURNABLE_WINDOW_DAYS = 2;
const CHUNK_SIZE = 500;

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
  sheet?: string;
}

interface SheetRow {
  rowNumber: number;
  externalId: string;
  sku: string;
}

interface VariantRow {
  id: string;
  productId: string;
  sku: string;
  externalProductId: string | null;
  returnAllowed: boolean;
  returnWindowDays: number | null;
}

const pairKey = (externalId: string, sku: string): string => `${externalId}\u0000${sku}`;

const absolutePath = (p: string): string => (isAbsolute(p) ? p : resolve(process.cwd(), p));

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: string }).text).trim();
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : String(v).trim();
  }
  return String(v).trim();
};

const printUsage = (): void => {
  console.log(`
product:return-allowed — Mark sheet matches as non-returnable; all others returnable (2 days)

Options:
  --file <path>   XLSX file  (default: ${DEFAULT_FILE})
  --sheet <name>  Worksheet name (default: first sheet)
  --apply         Persist changes to DB (default: dry-run)
  --limit <n>     Cap each update group to N variants (test only; omit for a full run)
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { file: DEFAULT_FILE, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') {
      opts.apply = true;
      continue;
    }
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
    }
  }
  return opts;
};

const readSheet = async (
  filePath: string,
  sheetName?: string,
): Promise<{
  rows: SheetRow[];
  skippedMissing: number;
}> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? (workbook.getWorksheet(sheetName) ?? workbook.worksheets[0])
    : workbook.worksheets[0];

  if (!worksheet) throw new Error(`No worksheet found in ${filePath}`);

  let idCol = 0;
  let skuCol = 0;
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (header === 'id') idCol = colNumber;
    else if (header === 'sku code' || header === 'sku') skuCol = colNumber;
  });

  if (!idCol || !skuCol) {
    const found = (worksheet.getRow(1).values as (string | undefined)[])
      ?.slice(1)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Could not find required columns "ID" and "SKU Code" in sheet "${worksheet.name}". Found: ${found}`,
    );
  }

  console.log(
    `[return-allowed] columns → ID=${idCol} "SKU Code"=${skuCol} in sheet "${worksheet.name}"`,
  );

  const rows: SheetRow[] = [];
  let skippedMissing = 0;

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const externalId = normalizeText(row.getCell(idCol));
    const sku = normalizeText(row.getCell(skuCol));
    if (!externalId && !sku) continue;
    if (!externalId || !sku) {
      skippedMissing += 1;
      continue;
    }
    rows.push({ rowNumber: r, externalId, sku });
  }

  return { rows, skippedMissing };
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`[return-allowed] file=${filePath}`);
  console.log(`[return-allowed] apply=${opts.apply}${opts.limit ? ` limit=${opts.limit}` : ''}`);

  const { rows: sheetRows, skippedMissing } = await readSheet(filePath, opts.sheet);
  if (!sheetRows.length) {
    throw new Error('Sheet is empty or has no rows with both ID and SKU Code');
  }

  const pairCounts = new Map<string, { externalId: string; sku: string; count: number }>();
  for (const row of sheetRows) {
    const key = pairKey(row.externalId, row.sku);
    const existing = pairCounts.get(key);
    if (existing) existing.count += 1;
    else pairCounts.set(key, { externalId: row.externalId, sku: row.sku, count: 1 });
  }

  const uniquePairs = [...pairCounts.values()];
  const duplicatePairs = uniquePairs.filter((p) => p.count > 1);
  const duplicateRowCount = sheetRows.length - uniquePairs.length;
  const uniqueKeys = new Set(pairCounts.keys());
  const sheetSkus = new Set(uniquePairs.map((p) => p.sku));
  const sheetIds = new Set(uniquePairs.map((p) => p.externalId));

  console.log(`[return-allowed] excel rows with ID+SKU=${sheetRows.length}`);
  console.log(`[return-allowed] unique (external_product_id, SKU) pairs=${uniquePairs.length}`);
  if (duplicateRowCount) {
    console.log(
      `[return-allowed] duplicate extra rows=${duplicateRowCount} (unique pairs with dupes=${duplicatePairs.length})`,
    );
  }
  if (skippedMissing) {
    console.log(`[return-allowed] skipped rows missing ID or SKU Code=${skippedMissing}`);
  }

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);
    const allVariants = await variantRepo
      .createQueryBuilder('v')
      .select([
        'v.id',
        'v.productId',
        'v.sku',
        'v.externalProductId',
        'v.returnAllowed',
        'v.returnWindowDays',
      ])
      .where('v.deleted_at IS NULL')
      .getMany();

    const variants: VariantRow[] = allVariants.map((v) => ({
      id: v.id,
      productId: v.productId,
      sku: (v.sku ?? '').trim(),
      externalProductId: v.externalProductId?.trim() || null,
      returnAllowed: v.returnAllowed,
      returnWindowDays: v.returnWindowDays,
    }));

    const matching: VariantRow[] = [];
    const nonMatching: VariantRow[] = [];
    const matchedKeys = new Set<string>();
    let skuOnlyHits = 0;
    let idOnlyHits = 0;

    for (const variant of variants) {
      const extId = variant.externalProductId;
      if (extId) {
        const key = pairKey(extId, variant.sku);
        if (uniqueKeys.has(key)) {
          matching.push(variant);
          matchedKeys.add(key);
          continue;
        }
      }

      const skuInSheet = sheetSkus.has(variant.sku);
      const idInSheet = extId ? sheetIds.has(extId) : false;
      if (skuInSheet && !idInSheet) skuOnlyHits += 1;
      else if (idInSheet && !skuInSheet) idOnlyHits += 1;

      nonMatching.push(variant);
    }

    const unmatchedExcel = uniquePairs.filter((p) => !matchedKeys.has(pairKey(p.externalId, p.sku)));

    let matchingToUpdate = matching;
    let nonMatchingToUpdate = nonMatching;
    if (opts.limit) {
      matchingToUpdate = matching.slice(0, opts.limit);
      nonMatchingToUpdate = nonMatching.slice(0, opts.limit);
      console.log(
        `[return-allowed] --limit=${opts.limit} applied per group (matching ${matchingToUpdate.length}/${matching.length}, non-matching ${nonMatchingToUpdate.length}/${nonMatching.length})`,
      );
    }

    const matchingChanging = matchingToUpdate.filter((v) => v.returnAllowed !== false);
    const returnableChanging = nonMatchingToUpdate.filter(
      (v) => v.returnAllowed !== true || v.returnWindowDays !== RETURNABLE_WINDOW_DAYS,
    );
    const windowChanging = nonMatchingToUpdate.filter(
      (v) => v.returnWindowDays !== RETURNABLE_WINDOW_DAYS,
    );

    console.log('[return-allowed] --- summary ---');
    console.log(`  Total Excel rows (ID + SKU Code):           ${sheetRows.length}`);
    console.log(`  Unique (external_product_id, SKU) pairs:    ${uniquePairs.length}`);
    console.log(`  Duplicate extra Excel rows:                 ${duplicateRowCount}`);
    console.log(`  Skipped Excel rows (missing ID or SKU):     ${skippedMissing}`);
    console.log(`  Matching variants → returnAllowed=false:    ${matchingToUpdate.length}`);
    console.log(`    already non-returnable:                   ${matchingToUpdate.length - matchingChanging.length}`);
    console.log(`    will change returnAllowed → false:        ${matchingChanging.length}`);
    console.log(`    returnWindowDays left unchanged`);
    console.log(`  Non-matching variants → returnAllowed=true: ${nonMatchingToUpdate.length}`);
    console.log(`    returnWindowDays will be set to ${RETURNABLE_WINDOW_DAYS}:     ${windowChanging.length}`);
    console.log(`    already returnable with window=${RETURNABLE_WINDOW_DAYS}: ${nonMatchingToUpdate.length - returnableChanging.length}`);
    console.log(`  Unmatched Excel pairs (no DB variant):      ${unmatchedExcel.length}`);
    console.log(`  SKU-only hits (NOT treated as match):       ${skuOnlyHits}`);
    console.log(`  external_product_id-only hits (NOT match):  ${idOnlyHits}`);
    console.log(`  Total variants scanned:                     ${variants.length}`);

    if (duplicatePairs.length) {
      console.log(
        '[return-allowed] duplicate pairs (first 20):',
        duplicatePairs.slice(0, 20).map((p) => ({
          externalProductId: p.externalId,
          sku: p.sku,
          occurrences: p.count,
        })),
      );
    }

    if (unmatchedExcel.length) {
      console.log(
        '[return-allowed] unmatched Excel pairs (first 30):',
        unmatchedExcel.slice(0, 30).map((p) => ({
          externalProductId: p.externalId,
          sku: p.sku,
        })),
      );
    }

    if (!opts.apply) {
      console.log(
        '[return-allowed] dry-run matching sample:',
        JSON.stringify(
          matchingChanging.slice(0, 10).map((v) => ({
            sku: v.sku,
            externalProductId: v.externalProductId,
            currentReturnAllowed: v.returnAllowed,
            currentReturnWindowDays: v.returnWindowDays,
            action: 'returnAllowed=false (returnWindowDays unchanged)',
          })),
          null,
          2,
        ),
      );
      console.log(
        '[return-allowed] dry-run non-matching sample:',
        JSON.stringify(
          returnableChanging.slice(0, 10).map((v) => ({
            sku: v.sku,
            externalProductId: v.externalProductId,
            currentReturnAllowed: v.returnAllowed,
            currentReturnWindowDays: v.returnWindowDays,
            action: `returnAllowed=true, returnWindowDays=${RETURNABLE_WINDOW_DAYS}`,
          })),
          null,
          2,
        ),
      );
      console.log('[return-allowed] dry-run complete — re-run with --apply to persist');
      return;
    }

    let matchingUpdated = 0;
    let returnableUpdated = 0;

    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductVariantEntity);

      for (const ids of chunk(
        matchingToUpdate.map((v) => v.id),
        CHUNK_SIZE,
      )) {
        if (!ids.length) continue;
        await repo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({ returnAllowed: false } as Partial<ProductVariantEntity>)
          .whereInIds(ids)
          .execute();
        matchingUpdated += ids.length;
        console.log(`[return-allowed] non-returnable ${matchingUpdated}/${matchingToUpdate.length}`);
      }

      for (const ids of chunk(
        nonMatchingToUpdate.map((v) => v.id),
        CHUNK_SIZE,
      )) {
        if (!ids.length) continue;
        await repo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({
            returnAllowed: true,
            returnWindowDays: RETURNABLE_WINDOW_DAYS,
          } as Partial<ProductVariantEntity>)
          .whereInIds(ids)
          .execute();
        returnableUpdated += ids.length;
        console.log(`[return-allowed] returnable ${returnableUpdated}/${nonMatchingToUpdate.length}`);
      }
    });

    const changedProductIds = [
      ...new Set([
        ...matchingChanging.map((v) => v.productId),
        ...returnableChanging.map((v) => v.productId),
      ]),
    ];

    let cacheKeysDeleted = 0;
    let redisConnected = false;
    if (changedProductIds.length) {
      const products = await AppDataSource.query<Array<{ ref_id: string }>>(
        `SELECT ref_id FROM products WHERE id = ANY($1)`,
        [changedProductIds],
      );
      const cacheResult = await invalidateProductCache(
        products.map((p) => ({ refId: p.ref_id })),
        false,
      );
      cacheKeysDeleted = cacheResult.keysDeleted;
      redisConnected = cacheResult.connected;
    }

    console.log('[return-allowed] --- apply complete ---');
    console.log(`  Matching variants marked non-returnable:    ${matchingUpdated}`);
    console.log(`  Variants marked returnable:                 ${returnableUpdated}`);
    console.log(`  Variants with returnWindowDays set to 2:    ${windowChanging.length}`);
    console.log(`  Unmatched Excel pairs:                      ${unmatchedExcel.length}`);
    console.log(`  Duplicate extra Excel rows:                 ${duplicateRowCount}`);
    console.log(`  cacheKeysDeleted=${cacheKeysDeleted} redis=${redisConnected}`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[return-allowed] failed:', error);
    process.exit(1);
  });
