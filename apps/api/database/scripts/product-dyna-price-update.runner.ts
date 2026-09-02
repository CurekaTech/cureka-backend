/**
 * Update variant mrp + sellingPrice from Dyna-Price-List-changed.xlsx.
 *
 * Sheet columns:
 *   SKU       → variant.sku  (exact match after trim; only match key)
 *   New MRP   → variant.mrp
 *   New Offer → variant.sellingPrice
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:update-dyna-prices
 *   npm run product:update-dyna-prices -- --apply
 *   npm run product:update-dyna-prices -- --file="docs/Master-Data-Sheets/Dyna-Price-List-changed.xlsx" --apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/Dyna-Price-List-changed.xlsx';
const CHUNK_SIZE = 200;
const SAMPLE_SIZE = 15;

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
  sheet?: string;
}

interface ParsedSheetRow {
  rowNumber: number;
  sku: string;
  newMrp: number;
  newOffer: number;
}

interface InvalidSheetRow {
  rowNumber: number;
  sku: string | null;
  reason: string;
}

interface PriceUpdateTarget {
  variantId: string;
  productId: string;
  sku: string;
  currentMrp: string;
  currentSellingPrice: string;
  newMrp: number;
  newOffer: number;
  excelRowNumber: number;
}

const absolutePath = (p: string): string => (isAbsolute(p) ? p : resolve(process.cwd(), p));

const normalizeSku = (value: string): string => value.trim();

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: string }).text).trim();
  }
  if (typeof v === 'object' && 'result' in v) {
    const result = (v as ExcelJS.CellFormulaValue).result;
    if (result == null) return '';
    return String(result).trim();
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : String(v).trim();
  }
  return String(v).trim();
};

const parsePrice = (cell: ExcelJS.Cell): number | null => {
  const raw = cell.value;
  if (raw == null || raw === '') return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw >= 0 ? raw : null;
  }

  if (typeof raw === 'object' && 'result' in raw) {
    const result = (raw as ExcelJS.CellFormulaValue).result;
    if (typeof result === 'number' && Number.isFinite(result)) {
      return result >= 0 ? result : null;
    }
    if (typeof result === 'string') {
      const parsed = Number(result.replace(/[,₹\s]/g, ''));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }
  }

  const text = normalizeText(cell).replace(/[,₹\s]/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const toMoneyString = (value: number): string => value.toFixed(2);

const pricesEqual = (current: string, next: number): boolean =>
  toMoneyString(Number(current)) === toMoneyString(next);

const printUsage = (): void => {
  console.log(`
product:update-dyna-prices — Update variant mrp + sellingPrice from Dyna price sheet

Options:
  --file <path>   XLSX file  (default: ${DEFAULT_FILE})
  --sheet <name>  Worksheet name (default: first sheet)
  --apply         Persist changes to DB (default: dry-run)
  --limit <n>     Process at most N matched variants (test only)
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
  validRows: ParsedSheetRow[];
  invalidRows: InvalidSheetRow[];
  duplicateRows: InvalidSheetRow[];
}> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? (workbook.getWorksheet(sheetName) ?? workbook.worksheets[0])
    : workbook.worksheets[0];

  if (!worksheet) throw new Error(`No worksheet found in ${filePath}`);

  let skuCol = 0;
  let mrpCol = 0;
  let offerCol = 0;

  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (header === 'sku') skuCol = colNumber;
    else if (header === 'new mrp') mrpCol = colNumber;
    else if (header === 'new offer') offerCol = colNumber;
  });

  const missing: string[] = [];
  if (!skuCol) missing.push('"SKU"');
  if (!mrpCol) missing.push('"New MRP"');
  if (!offerCol) missing.push('"New Offer"');

  if (missing.length) {
    const found = (worksheet.getRow(1).values as (string | undefined)[])
      ?.slice(1)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Missing required columns: ${missing.join(', ')}. Found: ${found}`,
    );
  }

  console.log(
    `[dyna-prices] columns → SKU=${skuCol} "New MRP"=${mrpCol} "New Offer"=${offerCol} in sheet "${worksheet.name}"`,
  );

  const validRows: ParsedSheetRow[] = [];
  const invalidRows: InvalidSheetRow[] = [];
  const duplicateRows: InvalidSheetRow[] = [];
  const seenSkus = new Map<string, number>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const sku = normalizeSku(normalizeText(row.getCell(skuCol)));
    const newMrp = parsePrice(row.getCell(mrpCol));
    const newOffer = parsePrice(row.getCell(offerCol));

    if (!sku && newMrp == null && newOffer == null) {
      continue;
    }

    if (!sku) {
      invalidRows.push({
        rowNumber,
        sku: null,
        reason: 'Missing SKU',
      });
      continue;
    }

    if (newMrp == null) {
      invalidRows.push({
        rowNumber,
        sku,
        reason: 'Invalid or missing New MRP',
      });
      continue;
    }

    if (newOffer == null) {
      invalidRows.push({
        rowNumber,
        sku,
        reason: 'Invalid or missing New Offer',
      });
      continue;
    }

    if (newOffer > newMrp) {
      invalidRows.push({
        rowNumber,
        sku,
        reason: `New Offer (${newOffer}) is greater than New MRP (${newMrp})`,
      });
      continue;
    }

    const previousRow = seenSkus.get(sku);
    if (previousRow != null) {
      duplicateRows.push({
        rowNumber,
        sku,
        reason: `Duplicate SKU (first seen on row ${previousRow})`,
      });
      continue;
    }

    seenSkus.set(sku, rowNumber);
    validRows.push({
      rowNumber,
      sku,
      newMrp,
      newOffer,
    });
  }

  return { validRows, invalidRows, duplicateRows };
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`[dyna-prices] file=${filePath}`);
  console.log(`[dyna-prices] apply=${opts.apply}${opts.limit ? ` limit=${opts.limit}` : ''}`);

  const { validRows, invalidRows, duplicateRows } = await readSheet(filePath, opts.sheet);
  const totalExcelRows = validRows.length + invalidRows.length + duplicateRows.length;

  if (!validRows.length) {
    throw new Error('Sheet has no valid price rows to process');
  }

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);
    const allVariants = await variantRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.productId', 'v.sku', 'v.mrp', 'v.sellingPrice'])
      .where('v.deleted_at IS NULL')
      .getMany();

    const bySku = new Map<string, ProductVariantEntity>();
    for (const variant of allVariants) {
      const sku = normalizeSku(variant.sku ?? '');
      if (!sku) continue;
      if (!bySku.has(sku)) {
        bySku.set(sku, variant);
      }
    }

    const targets: PriceUpdateTarget[] = [];
    const unmatchedSkus: string[] = [];

    for (const row of validRows) {
      const variant = bySku.get(row.sku);
      if (!variant) {
        unmatchedSkus.push(row.sku);
        continue;
      }

      targets.push({
        variantId: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        currentMrp: variant.mrp,
        currentSellingPrice: variant.sellingPrice,
        newMrp: row.newMrp,
        newOffer: row.newOffer,
        excelRowNumber: row.rowNumber,
      });
    }

    const limitedTargets = opts.limit ? targets.slice(0, opts.limit) : targets;
    const mrpChanging = limitedTargets.filter((t) => !pricesEqual(t.currentMrp, t.newMrp));
    const sellingChanging = limitedTargets.filter(
      (t) => !pricesEqual(t.currentSellingPrice, t.newOffer),
    );
    const noChange = limitedTargets.filter(
      (t) =>
        pricesEqual(t.currentMrp, t.newMrp) &&
        pricesEqual(t.currentSellingPrice, t.newOffer),
    );
    const willUpdate = limitedTargets.filter(
      (t) =>
        !pricesEqual(t.currentMrp, t.newMrp) ||
        !pricesEqual(t.currentSellingPrice, t.newOffer),
    );

    console.log('[dyna-prices] --- summary ---');
    console.log(`  Total Excel rows processed:        ${totalExcelRows}`);
    console.log(`  Valid rows:                      ${validRows.length}`);
    console.log(`  Invalid/skipped rows:            ${invalidRows.length}`);
    console.log(`  Duplicate SKU rows skipped:      ${duplicateRows.length}`);
    console.log(`  Unique SKUs in sheet:            ${validRows.length}`);
    console.log(`  Matching variants:               ${targets.length}`);
    console.log(`  Unmatched SKUs:                  ${unmatchedSkus.length}`);
    console.log(`  Variants with MRP change:        ${mrpChanging.length}`);
    console.log(`  Variants with selling change:    ${sellingChanging.length}`);
    console.log(`  Variants with no price change:   ${noChange.length}`);
    console.log(`  Variants to update:              ${willUpdate.length}`);

    if (invalidRows.length) {
      console.log(
        '[dyna-prices] invalid rows (first 20):',
        invalidRows.slice(0, 20),
      );
    }

    if (duplicateRows.length) {
      console.log(
        '[dyna-prices] duplicate SKU rows (first 20):',
        duplicateRows.slice(0, 20),
      );
    }

    if (unmatchedSkus.length) {
      console.log(
        '[dyna-prices] unmatched SKUs (first 30):',
        unmatchedSkus.slice(0, 30),
      );
    }

    const sample = willUpdate.slice(0, SAMPLE_SIZE);
    if (sample.length) {
      console.log('[dyna-prices] proposed updates (sample):');
      for (const target of sample) {
        console.log(`  SKU: ${target.sku}`);
        console.log(`    Current MRP: ${toMoneyString(Number(target.currentMrp))}`);
        console.log(`    New MRP: ${toMoneyString(target.newMrp)}`);
        console.log(
          `    Current Selling Price: ${toMoneyString(Number(target.currentSellingPrice))}`,
        );
        console.log(`    New Selling Price: ${toMoneyString(target.newOffer)}`);
      }
    }

    if (!opts.apply) {
      console.log('[dyna-prices] dry-run complete — re-run with --apply to persist');
      return;
    }

    if (!willUpdate.length) {
      console.log('[dyna-prices] nothing to update');
      return;
    }

    let updated = 0;
    const touchedProductIds = new Set<string>();

    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductVariantEntity);

      for (const batch of chunk(willUpdate, CHUNK_SIZE)) {
        for (const target of batch) {
          await repo
            .createQueryBuilder()
            .update(ProductVariantEntity)
            .set({
              mrp: toMoneyString(target.newMrp),
              sellingPrice: toMoneyString(target.newOffer),
            } as Partial<ProductVariantEntity>)
            .where('id = :id', { id: target.variantId })
            .execute();

          updated += 1;
          touchedProductIds.add(target.productId);
        }

        console.log(`[dyna-prices] updated ${updated}/${willUpdate.length}`);
      }
    });

    let cacheKeysDeleted = 0;
    let redisConnected = false;
    if (touchedProductIds.size) {
      const products = await AppDataSource.query<Array<{ ref_id: string }>>(
        `SELECT ref_id FROM products WHERE id = ANY($1)`,
        [[...touchedProductIds]],
      );
      const cacheResult = await invalidateProductCache(
        products.map((p) => ({ refId: p.ref_id })),
        false,
      );
      cacheKeysDeleted = cacheResult.keysDeleted;
      redisConnected = cacheResult.connected;
    }

    console.log('[dyna-prices] --- apply complete ---');
    console.log(`  Successfully updated variants:     ${updated}`);
    console.log(`  Unmatched SKUs:                  ${unmatchedSkus.length}`);
    console.log(`  Invalid/skipped rows:            ${invalidRows.length}`);
    console.log(`  Duplicate SKU rows skipped:      ${duplicateRows.length}`);
    console.log(`  cacheKeysDeleted=${cacheKeysDeleted} redis=${redisConnected}`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[dyna-prices] failed:', error);
    process.exit(1);
  });
