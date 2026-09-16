/**
 * Update product variant prices (sellingPrice + mrp) from the updated-price-02-aug.xlsx sheet.
 *
 * Sheet columns expected:
 *   ID           → variant.external_product_id   (used for primary match)
 *   SKU          → variant.sku                   (cross-checked against ID match)
 *   Sale Price   → variant.selling_price          (our selling price)
 *   Regular Price→ variant.mrp                   (MRP)
 *
 * Matching logic:
 *   - First tries external_product_id (ID column) match
 *   - Cross-validates SKU for safety (logs a warning if they diverge)
 *   - Falls back to SKU-only match when ID is blank
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:price-update
 *   npm run product:price-update -- --file="docs/Master-Data-Sheets/updated-price-02-aug.xlsx" --apply
 *   npm run product:price-update -- --apply --limit=100
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/updated-price-02-aug.xlsx';

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
  sheet?: string;
}

interface SheetRow {
  externalId: string;
  sku: string;
  salePrice: number;
  regularPrice: number;
}

interface Target {
  variantId: string;
  productId: string;
  sku: string;
  externalProductId: string | null;
  currentMrp: string;
  currentSellingPrice: string;
  newMrp: number;
  newSellingPrice: number;
  newDiscountPercent: number | null;
  matchedBy: 'external_id+sku' | 'external_id' | 'sku';
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

const parseNumber = (cell: ExcelJS.Cell): number | null => {
  const v = cell.value;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const calcDiscountPercent = (mrp: number, selling: number): number | null => {
  if (mrp <= 0) return null;
  const pct = ((mrp - selling) / mrp) * 100;
  return Math.round(pct * 100) / 100;
};

const printUsage = (): void => {
  console.log(`
product:price-update — Update sellingPrice + mrp from a price sheet

Options:
  --file <path>   XLSX file  (default: ${DEFAULT_FILE})
  --sheet <name>  Worksheet name (default: first sheet)
  --apply         Persist changes to DB (default: dry-run)
  --limit <n>     Process at most N variants
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

  // Detect columns (case-insensitive)
  let idCol = 0, skuCol = 0, salePriceCol = 0, regularPriceCol = 0;
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ');
    if (header === 'id') idCol = colNumber;
    else if (header === 'sku') skuCol = colNumber;
    else if (header === 'sale price') salePriceCol = colNumber;
    else if (header === 'regular price') regularPriceCol = colNumber;
  });

  const missing: string[] = [];
  if (!skuCol) missing.push('"SKU"');
  if (!salePriceCol) missing.push('"Sale Price"');
  if (!regularPriceCol) missing.push('"Regular Price"');

  if (missing.length) {
    const foundHeaders = (headerRow.values as ExcelJS.CellValue[])
      ?.slice(1)
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Missing required columns: ${missing.join(', ')}. ` +
      `Found: ${foundHeaders}`,
    );
  }

  console.log(
    `[price-update] columns → ID=${idCol || 'n/a'} SKU=${skuCol} "Sale Price"=${salePriceCol} "Regular Price"=${regularPriceCol}` +
    ` in sheet "${worksheet.name}"`,
  );

  const rows: SheetRow[] = [];
  const skipped: string[] = [];

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const externalId = idCol ? normalizeText(row.getCell(idCol)) : '';
    const sku = normalizeText(row.getCell(skuCol));
    const salePrice = parseNumber(row.getCell(salePriceCol));
    const regularPrice = parseNumber(row.getCell(regularPriceCol));

    if (!sku && !externalId) continue;

    if (salePrice == null || regularPrice == null) {
      skipped.push(`row ${r} sku=${sku || externalId} — missing price`);
      continue;
    }
    if (salePrice > regularPrice) {
      skipped.push(`row ${r} sku=${sku} — Sale Price (${salePrice}) > Regular Price (${regularPrice}), skipped`);
      continue;
    }

    rows.push({ externalId, sku, salePrice, regularPrice });
  }

  if (skipped.length) {
    console.log(`[price-update] skipped rows (first 20):`, skipped.slice(0, 20));
  }

  return rows;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`[price-update] file=${filePath}`);
  console.log(`[price-update] apply=${opts.apply}${opts.limit ? ` limit=${opts.limit}` : ''}`);

  const sheetRows = await readSheet(filePath, opts.sheet);
  if (!sheetRows.length) throw new Error('Sheet is empty or has no valid price rows');
  console.log(`[price-update] sheet rows with prices=${sheetRows.length}`);

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);

    // Load all variants: id, productId, sku, externalProductId, mrp, sellingPrice
    const allVariants = await variantRepo
      .createQueryBuilder('v')
      .select([
        'v.id', 'v.productId', 'v.sku', 'v.externalProductId',
        'v.mrp', 'v.sellingPrice',
      ])
      .where('v.deleted_at IS NULL')
      .getMany();

    // Build lookup maps
    const byExternalId = new Map<string, ProductVariantEntity>();
    const bySku = new Map<string, ProductVariantEntity>();

    for (const v of allVariants) {
      if (v.externalProductId?.trim()) {
        byExternalId.set(v.externalProductId.trim().toLowerCase(), v);
      }
      bySku.set(v.sku.trim().toLowerCase(), v);
    }

    const targets: Target[] = [];
    const notFound: string[] = [];
    const skuMismatches: string[] = [];
    const seenVariantIds = new Set<string>();

    for (const row of sheetRows) {
      const extKey = row.externalId.toLowerCase();
      const skuKey = row.sku.toLowerCase();

      let variant: ProductVariantEntity | undefined;
      let matchedBy: Target['matchedBy'] = 'sku';

      if (extKey) {
        variant = byExternalId.get(extKey);
        if (variant) {
          matchedBy = 'external_id';
          // Cross-validate SKU when both are available
          if (skuKey && variant.sku.trim().toLowerCase() !== skuKey) {
            skuMismatches.push(
              `externalId=${row.externalId} sheetSku=${row.sku} dbSku=${variant.sku} — using DB variant (ID match takes priority)`,
            );
          } else if (skuKey) {
            matchedBy = 'external_id+sku';
          }
        }
      }

      // Fallback to SKU-only when no external ID or external ID had no match
      if (!variant && skuKey) {
        variant = bySku.get(skuKey);
        if (variant) matchedBy = 'sku';
      }

      if (!variant) {
        notFound.push(row.externalId || row.sku);
        continue;
      }

      if (seenVariantIds.has(variant.id)) continue;
      seenVariantIds.add(variant.id);

      const discountPercent = calcDiscountPercent(row.regularPrice, row.salePrice);

      targets.push({
        variantId: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        externalProductId: variant.externalProductId,
        currentMrp: variant.mrp,
        currentSellingPrice: variant.sellingPrice,
        newMrp: row.regularPrice,
        newSellingPrice: row.salePrice,
        newDiscountPercent: discountPercent,
        matchedBy,
      });
    }

    const limited = opts.limit ? targets.slice(0, opts.limit) : targets;

    console.log(
      `[price-update] matched=${limited.length} notFoundInDB=${notFound.length}` +
      (skuMismatches.length ? ` skuMismatches=${skuMismatches.length}` : ''),
    );

    if (skuMismatches.length) {
      console.warn('[price-update] SKU/ID mismatches (first 10):', skuMismatches.slice(0, 10));
    }
    if (notFound.length) {
      console.log(`[price-update] not found in DB (first 30):`, notFound.slice(0, 30));
    }

    if (!opts.apply) {
      const sample = limited.slice(0, 20).map((t) => ({
        sku: t.sku,
        externalProductId: t.externalProductId,
        matchedBy: t.matchedBy,
        currentMrp: t.currentMrp,
        newMrp: t.newMrp,
        currentSellingPrice: t.currentSellingPrice,
        newSellingPrice: t.newSellingPrice,
        newDiscountPercent: t.newDiscountPercent,
      }));
      console.log('[price-update] dry-run sample:', JSON.stringify(sample, null, 2));
      console.log(`[price-update] dry-run complete — re-run with --apply to persist`);
      return;
    }

    if (!limited.length) {
      console.log('[price-update] nothing to update');
      return;
    }

    // Update in batches of 200 (individual updates to set per-row values)
    let updated = 0;
    let failed = 0;
    const failures: string[] = [];
    const touchedProductIds: string[] = [];

    for (const target of limited) {
      try {
        await variantRepo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({
            mrp: String(target.newMrp),
            sellingPrice: String(target.newSellingPrice),
            discountPercentage: target.newDiscountPercent != null
              ? String(target.newDiscountPercent)
              : null,
          })
          .where('id = :id', { id: target.variantId })
          .execute();

        updated++;
        touchedProductIds.push(target.productId);

        if (updated % 100 === 0) {
          console.log(`[price-update] updated ${updated}/${limited.length}`);
        }
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`sku=${target.sku} error=${msg}`);
        console.error(`[price-update] FAIL sku=${target.sku}: ${msg}`);
      }
    }

    // Invalidate Redis cache
    const uniqueProductIds = [...new Set(touchedProductIds)];
    const products = await AppDataSource.query<Array<{ ref_id: string }>>(
      `SELECT ref_id FROM products WHERE id = ANY($1)`,
      [uniqueProductIds],
    );
    const cacheResult = await invalidateProductCache(
      products.map((p) => ({ refId: p.ref_id })),
      false,
    );

    console.log(
      `[price-update] done updated=${updated} failed=${failed} cacheKeysDeleted=${cacheResult.keysDeleted} redis=${cacheResult.connected}`,
    );
    if (failures.length) {
      console.log('[price-update] failures:', failures.slice(0, 20));
    }
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[price-update] failed:', error);
    process.exit(1);
  });
