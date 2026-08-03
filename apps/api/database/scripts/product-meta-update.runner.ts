/**
 * Update product & variant SEO metadata from the meta-data-beta-products.xlsx sheet.
 *
 * Sheet columns expected (auto-detected, case-insensitive):
 *   Product ID   → variant.external_product_id   (primary match key)
 *   SKU          → variant.sku                   (cross-validated against Product ID)
 *   Meta Title   → variant.meta_title + product.meta_title
 *   Meta desc    → variant.meta_description + product.meta_description
 *   Keywords     → variant.meta_keywords + product.meta_keywords  (comma-split → string[])
 *
 * Matching logic (same as price-update):
 *   1. Match by external_product_id (Product ID column), cross-check SKU
 *   2. Fallback to SKU-only when Product ID is blank or has no DB match
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:meta-update
 *   npm run product:meta-update -- --file="docs/Master-Data-Sheets/meta-data-beta-products.xlsx" --apply
 *   npm run product:meta-update -- --apply --limit=100
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/meta-data-beta-products.xlsx';

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
  sheet?: string;
}

interface SheetRow {
  externalId: string;
  sku: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string[];
}

interface Target {
  variantId: string;
  productId: string;
  sku: string;
  externalProductId: string | null;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string[];
  matchedBy: 'external_id+sku' | 'external_id' | 'sku';
}

// ─── helpers ────────────────────────────────────────────────────────────────

const absolutePath = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.cwd(), p);

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v)
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim();
  if (typeof v === 'object' && 'text' in v)
    return String((v as { text: string }).text).trim();
  return String(v).trim();
};

const parseKeywords = (raw: string): string[] =>
  raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

const printUsage = (): void => {
  console.log(`
product:meta-update — Update meta title, description & keywords from a sheet

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

// ─── sheet reader ────────────────────────────────────────────────────────────

const readSheet = async (filePath: string, sheetName?: string): Promise<SheetRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? (workbook.getWorksheet(sheetName) ?? workbook.worksheets[0])
    : workbook.worksheets[0];

  if (!worksheet) throw new Error(`No worksheet found in ${filePath}`);

  // Auto-detect columns (case-insensitive, flexible header matching)
  let productIdCol = 0, skuCol = 0, metaTitleCol = 0, metaDescCol = 0, keywordsCol = 0;

  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (header === 'product id') productIdCol = colNumber;
    else if (header === 'sku') skuCol = colNumber;
    else if (header === 'meta title') metaTitleCol = colNumber;
    else if (header === 'meta desc' || header === 'meta description') metaDescCol = colNumber;
    else if (header === 'keywords' || header === 'keyword') keywordsCol = colNumber;
  });

  const missing: string[] = [];
  if (!skuCol && !productIdCol) missing.push('"SKU" or "Product ID"');
  if (!metaTitleCol) missing.push('"Meta Title"');
  if (!metaDescCol) missing.push('"Meta desc"');
  if (!keywordsCol) missing.push('"Keywords"');

  if (missing.length) {
    const foundHeaders = (worksheet.getRow(1).values as (string | undefined)[])
      ?.slice(1)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Missing required columns: ${missing.join(', ')}. Found: ${foundHeaders}`,
    );
  }

  console.log(
    `[meta-update] columns → "Product ID"=${productIdCol || 'n/a'} SKU=${skuCol || 'n/a'}` +
    ` "Meta Title"=${metaTitleCol} "Meta desc"=${metaDescCol} "Keywords"=${keywordsCol}` +
    ` in sheet "${worksheet.name}"`,
  );

  const rows: SheetRow[] = [];
  const skipped: string[] = [];

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const externalId = productIdCol ? normalizeText(row.getCell(productIdCol)) : '';
    const sku = skuCol ? normalizeText(row.getCell(skuCol)) : '';

    if (!externalId && !sku) continue;

    const metaTitle = metaTitleCol ? normalizeText(row.getCell(metaTitleCol)) : '';
    const metaDescription = metaDescCol ? normalizeText(row.getCell(metaDescCol)) : '';
    const keywordsRaw = keywordsCol ? normalizeText(row.getCell(keywordsCol)) : '';
    const metaKeywords = parseKeywords(keywordsRaw);

    if (!metaTitle && !metaDescription && !metaKeywords.length) {
      skipped.push(`row ${r} sku=${sku || externalId} — all meta fields empty, skipped`);
      continue;
    }

    rows.push({ externalId, sku, metaTitle, metaDescription, metaKeywords });
  }

  if (skipped.length) {
    console.log(`[meta-update] skipped rows (first 20):`, skipped.slice(0, 20));
  }

  return rows;
};

// ─── main ────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`[meta-update] file=${filePath}`);
  console.log(`[meta-update] apply=${opts.apply}${opts.limit ? ` limit=${opts.limit}` : ''}`);

  const sheetRows = await readSheet(filePath, opts.sheet);
  if (!sheetRows.length) throw new Error('Sheet is empty or has no valid meta rows');
  console.log(`[meta-update] sheet rows with meta=${sheetRows.length}`);

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);
    const productRepo = AppDataSource.getRepository(ProductEntity);

    // Load all non-deleted variants: id, productId, sku, externalProductId
    const allVariants = await variantRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.productId', 'v.sku', 'v.externalProductId'])
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
          if (skuKey && variant.sku.trim().toLowerCase() !== skuKey) {
            skuMismatches.push(
              `externalId=${row.externalId} sheetSku=${row.sku} dbSku=${variant.sku} — using DB variant (ID match takes priority)`,
            );
          } else if (skuKey) {
            matchedBy = 'external_id+sku';
          }
        }
      }

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

      targets.push({
        variantId: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        externalProductId: variant.externalProductId,
        metaTitle: row.metaTitle,
        metaDescription: row.metaDescription,
        metaKeywords: row.metaKeywords,
        matchedBy,
      });
    }

    const limited = opts.limit ? targets.slice(0, opts.limit) : targets;

    console.log(
      `[meta-update] matched=${limited.length} notFoundInDB=${notFound.length}` +
      (skuMismatches.length ? ` skuMismatches=${skuMismatches.length}` : ''),
    );

    if (skuMismatches.length) {
      console.warn('[meta-update] SKU/ID mismatches (first 10):', skuMismatches.slice(0, 10));
    }
    if (notFound.length) {
      console.log(`[meta-update] not found in DB (first 30):`, notFound.slice(0, 30));
    }

    // ── dry-run preview ──────────────────────────────────────────────────────
    if (!opts.apply) {
      const sample = limited.slice(0, 10).map((t) => ({
        sku: t.sku,
        externalProductId: t.externalProductId,
        matchedBy: t.matchedBy,
        metaTitle: t.metaTitle,
        metaDescription: t.metaDescription.slice(0, 80) + (t.metaDescription.length > 80 ? '…' : ''),
        metaKeywords: t.metaKeywords.slice(0, 3),
      }));
      console.log('[meta-update] dry-run sample:', JSON.stringify(sample, null, 2));
      console.log(`[meta-update] dry-run complete — re-run with --apply to persist`);
      return;
    }

    if (!limited.length) {
      console.log('[meta-update] nothing to update');
      return;
    }

    // ── apply updates ────────────────────────────────────────────────────────
    let variantUpdated = 0;
    let productUpdated = 0;
    let failed = 0;
    const failures: string[] = [];
    const touchedProductIds: string[] = [];

    // Collect unique product updates (last-write-wins per productId)
    const productMetaMap = new Map<string, Pick<Target, 'metaTitle' | 'metaDescription' | 'metaKeywords'>>();
    for (const target of limited) {
      productMetaMap.set(target.productId, {
        metaTitle: target.metaTitle,
        metaDescription: target.metaDescription,
        metaKeywords: target.metaKeywords,
      });
    }

    // Update variant meta
    for (const target of limited) {
      try {
        await variantRepo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({
            metaTitle: target.metaTitle || null,
            metaDescription: target.metaDescription || null,
            metaKeywords: target.metaKeywords.length ? target.metaKeywords : null,
          } as Partial<ProductVariantEntity>)
          .where('id = :id', { id: target.variantId })
          .execute();

        variantUpdated++;
        touchedProductIds.push(target.productId);

        if (variantUpdated % 200 === 0) {
          console.log(`[meta-update] variants updated ${variantUpdated}/${limited.length}`);
        }
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`sku=${target.sku} error=${msg}`);
        console.error(`[meta-update] FAIL variant sku=${target.sku}: ${msg}`);
      }
    }

    // Update product meta (one update per unique productId)
    for (const [productId, meta] of productMetaMap.entries()) {
      try {
        await productRepo
          .createQueryBuilder()
          .update(ProductEntity)
          .set({
            metaTitle: meta.metaTitle || null,
            metaDescription: meta.metaDescription || null,
            metaKeywords: meta.metaKeywords.length ? meta.metaKeywords : null,
          } as Partial<ProductEntity>)
          .where('id = :id', { id: productId })
          .execute();

        productUpdated++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`productId=${productId} error=${msg}`);
        console.error(`[meta-update] FAIL product id=${productId}: ${msg}`);
      }
    }

    // Invalidate Redis cache for all touched products
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
      `[meta-update] done variantsUpdated=${variantUpdated} productsUpdated=${productUpdated}` +
      ` failed=${failed} cacheKeysDeleted=${cacheResult.keysDeleted} redis=${cacheResult.connected}`,
    );
    if (failures.length) {
      console.log('[meta-update] failures:', failures.slice(0, 20));
    }
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[meta-update] failed:', error);
    process.exit(1);
  });
