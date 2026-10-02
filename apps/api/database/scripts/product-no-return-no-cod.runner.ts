/**
 * Mark sheet SKUs as no-COD and non-returnable.
 *
 * Sheet column:
 *   SKU → variant.sku  (case-insensitive; the only match key)
 *
 * Matching variants: codAvailable = false, returnAllowed = false.
 * returnWindowDays and returnPolicy are left unchanged.
 * Other variants are not changed.
 *
 * When every non-deleted variant SKU of a product is in the sheet, the product
 * row is updated the same way (codAvailable = false, returnAllowed = false).
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 * Both modes write unmatched and updated CSV reports plus a log file.
 *
 * Usage:
 *   npm run product:no-return-no-cod
 *   npm run product:no-return-no-cod -- --apply
 *   npm run product:no-return-no-cod -- --file="docs/Master-Data-Sheets/no-return-no-cod-02-10.xlsx" --apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { buildProductPermalink } from '../../../../modules/public/utils/category-permalink.util';
import { coerceDbBoolean } from '../../../../packages/common/src/stock-validation.config';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/no-return-no-cod-02-10.xlsx';
const EXPORT_DIR = 'docs/Master-Data-Sheets/exports';
const UNMATCHED_CSV = `${EXPORT_DIR}/no-return-no-cod-unmatched.csv`;
const UPDATED_CSV = `${EXPORT_DIR}/no-return-no-cod-updated.csv`;
const LOG_FILE = `${EXPORT_DIR}/no-return-no-cod.log`;
const CHUNK_SIZE = 500;
const REVALIDATE_BATCH = 32;
const LOG_PREFIX = '[no-return-no-cod]';

interface CliOptions {
  file: string;
  apply: boolean;
  sheet?: string;
}

interface SheetRow {
  rowNumber: number;
  externalId: string;
  sku: string;
  name: string;
}

interface VariantRow {
  id: string;
  productId: string;
  sku: string;
  codAvailable: boolean;
  returnAllowed: boolean;
  productRefId: string;
  productSlug: string;
  productCodAvailable: boolean;
  productReturnAllowed: boolean;
}

interface RevalidateTarget {
  slug: string;
  path: string;
}

const skuKey = (sku: string): string => sku.trim().toLowerCase();

const absolutePath = (p: string): string => (isAbsolute(p) ? p : resolve(process.cwd(), p));

const csvEscape = (value: string): string => {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
};

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return v.richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: string }).text).trim();
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : String(v).trim();
  }
  return String(v).trim();
};

const logLines: string[] = [];

const log = (message: string): void => {
  console.log(message);
  logLines.push(message);
};

const flushLog = (filePath: string): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${logLines.join('\n')}\n`, 'utf8');
};

const writeCsv = (filePath: string, lines: string[]): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const printUsage = (): void => {
  console.log(`
product:no-return-no-cod — Mark sheet SKUs as no-COD and non-returnable

Options:
  --file <path>   XLSX file  (default: ${DEFAULT_FILE})
  --sheet <name>  Worksheet name (default: first sheet)
  --apply         Persist changes to DB and refresh cache (default: dry-run)
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
    }
  }
  return opts;
};

const readSheet = async (
  filePath: string,
  sheetName?: string,
): Promise<{ rows: SheetRow[]; skippedBlankSku: number; sheetName: string }> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? (workbook.getWorksheet(sheetName) ?? workbook.worksheets[0])
    : workbook.worksheets[0];

  if (!worksheet) throw new Error(`No worksheet found in ${filePath}`);

  let idCol = 0;
  let skuCol = 0;
  let nameCol = 0;
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').replace(/\*$/, '').trim();
    if (header === 'id') idCol = colNumber;
    else if (header === 'sku' || header === 'sku code') skuCol = colNumber;
    else if (header === 'name' || header === 'product name') nameCol = colNumber;
  });

  if (!skuCol) {
    const found = (worksheet.getRow(1).values as (string | undefined)[])
      ?.slice(1)
      .filter(Boolean)
      .join(', ');
    throw new Error(`Could not find required column "SKU" in sheet "${worksheet.name}". Found: ${found}`);
  }

  log(
    `${LOG_PREFIX} columns → ID=${idCol || 'n/a'} SKU=${skuCol} Name=${nameCol || 'n/a'} in sheet "${worksheet.name}"`,
  );

  const rows: SheetRow[] = [];
  let skippedBlankSku = 0;

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const externalId = idCol ? normalizeText(row.getCell(idCol)) : '';
    const sku = normalizeText(row.getCell(skuCol));
    const name = nameCol ? normalizeText(row.getCell(nameCol)) : '';
    if (!externalId && !sku && !name) continue;
    if (!sku) {
      skippedBlankSku += 1;
      continue;
    }
    rows.push({ rowNumber: r, externalId, sku, name });
  }

  return { rows, skippedBlankSku, sheetName: worksheet.name };
};

const shopPathFor = (
  productPageUrl: string | null,
  categorySlugPath: string[],
  slug: string,
): string => {
  const stored = productPageUrl?.trim();
  if (stored?.startsWith('/')) return stored.split('?')[0] || stored;
  return buildProductPermalink(categorySlugPath, slug);
};

const loadRevalidateTargets = async (productIds: string[]): Promise<RevalidateTarget[]> => {
  if (!productIds.length) return [];

  const rows = await AppDataSource.query<
    Array<{
      slug: string | null;
      category_slug: string | null;
      sub_slug: string | null;
      sub_sub_slug: string | null;
      sub_sub_sub_slug: string | null;
      product_page_url: string | null;
      variant_slug: string | null;
    }>
  >(
    `
    SELECT p.slug,
           c.slug AS category_slug,
           sc.slug AS sub_slug,
           ssc.slug AS sub_sub_slug,
           sssc.slug AS sub_sub_sub_slug,
           v.product_page_url,
           v.slug AS variant_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories sc ON sc.id = p.sub_category_id
    LEFT JOIN categories ssc ON ssc.id = p.sub_sub_category_id
    LEFT JOIN categories sssc ON sssc.id = p.sub_sub_sub_category_id
    LEFT JOIN LATERAL (
      SELECT product_page_url, slug
      FROM product_variants
      WHERE product_id = p.id AND deleted_at IS NULL
      ORDER BY selling_price ASC NULLS LAST
      LIMIT 1
    ) v ON true
    WHERE p.id = ANY($1::uuid[])
      AND p.deleted_at IS NULL
    `,
    [productIds],
  );

  return rows
    .filter((row) => Boolean(row.slug?.trim()))
    .map((row) => {
      const slug = row.slug!.trim();
      const categorySlugPath = [
        row.category_slug,
        row.sub_slug,
        row.sub_sub_slug,
        row.sub_sub_sub_slug,
      ].filter((value): value is string => Boolean(value?.trim()));
      return {
        slug,
        path: shopPathFor(row.product_page_url, categorySlugPath, row.variant_slug?.trim() || slug),
      };
    });
};

const revalidateStorefront = async (targets: RevalidateTarget[]): Promise<void> => {
  if (!targets.length) {
    log(`${LOG_PREFIX} storefront revalidate skipped (no changed products)`);
    return;
  }

  const secret = process.env['REVALIDATE_SECRET']?.trim();
  const storefrontUrl = process.env['STOREFRONT_URL']?.trim().replace(/\/+$/, '');
  if (!secret || !storefrontUrl) {
    log(
      `${LOG_PREFIX} warning: skipping storefront revalidate (STOREFRONT_URL or REVALIDATE_SECRET is not set). Database update is kept.`,
    );
    return;
  }

  for (let index = 0; index < targets.length; index += REVALIDATE_BATCH) {
    const batch = targets.slice(index, index + REVALIDATE_BATCH);
    const tags = [...new Set(batch.map((item) => `product:${item.slug}`))].filter(
      (tag) => tag.length <= 256,
    );
    const paths = [...new Set(batch.map((item) => item.path))].filter(
      (path) => path.startsWith('/') && path.length <= 256,
    );
    const batchNumber = Math.floor(index / REVALIDATE_BATCH) + 1;

    try {
      const response = await fetch(`${storefrontUrl}/api/revalidate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify({ tags, paths }),
      });
      const text = await response.text();
      log(
        `${LOG_PREFIX} storefront revalidate batch=${batchNumber} status=${response.status} tags=${tags.length} paths=${paths.length} body=${text.slice(0, 200)}`,
      );
    } catch (error) {
      log(
        `${LOG_PREFIX} warning: storefront revalidate batch=${batchNumber} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);
  const unmatchedPath = absolutePath(UNMATCHED_CSV);
  const updatedPath = absolutePath(UPDATED_CSV);
  const logPath = absolutePath(LOG_FILE);

  log(`${LOG_PREFIX} file=${filePath}`);
  log(`${LOG_PREFIX} apply=${opts.apply}`);

  const { rows: sheetRows, skippedBlankSku, sheetName } = await readSheet(filePath, opts.sheet);
  if (!sheetRows.length) {
    throw new Error('Sheet is empty or has no rows with SKU');
  }

  const skuCounts = new Map<string, { sku: string; count: number }>();
  for (const row of sheetRows) {
    const key = skuKey(row.sku);
    const existing = skuCounts.get(key);
    if (existing) existing.count += 1;
    else skuCounts.set(key, { sku: row.sku, count: 1 });
  }

  const uniqueSkus = [...skuCounts.values()];
  const duplicateSkus = uniqueSkus.filter((item) => item.count > 1);
  const duplicateRowCount = sheetRows.length - uniqueSkus.length;
  const sheetSkuKeys = new Set(skuCounts.keys());

  log(`${LOG_PREFIX} sheet="${sheetName}"`);
  log(`${LOG_PREFIX} excel data rows with SKU=${sheetRows.length}`);
  log(`${LOG_PREFIX} unique SKUs (case-insensitive)=${uniqueSkus.length}`);
  log(`${LOG_PREFIX} blank SKU rows skipped=${skippedBlankSku}`);
  log(`${LOG_PREFIX} duplicate extra SKU rows=${duplicateRowCount}`);
  if (duplicateSkus.length) {
    log(
      `${LOG_PREFIX} duplicate SKUs (first 20): ${JSON.stringify(
        duplicateSkus.slice(0, 20).map((item) => ({ sku: item.sku, occurrences: item.count })),
      )}`,
    );
  }

  await AppDataSource.initialize();
  try {
    const rawVariants = await AppDataSource.query<
      Array<{
        id: string;
        productId: string;
        sku: string | null;
        codAvailable: boolean | string | number | null;
        returnAllowed: boolean | string | number | null;
        productRefId: string;
        productSlug: string;
        productCodAvailable: boolean | string | number | null;
        productReturnAllowed: boolean | string | number | null;
      }>
    >(
      `
      SELECT
        v.id,
        v.product_id AS "productId",
        v.sku,
        v.cod_available AS "codAvailable",
        v.return_allowed AS "returnAllowed",
        p.ref_id AS "productRefId",
        p.slug AS "productSlug",
        p.cod_available AS "productCodAvailable",
        p.return_allowed AS "productReturnAllowed"
      FROM product_variants v
      INNER JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
      WHERE v.deleted_at IS NULL
      `,
    );

    const variants: VariantRow[] = rawVariants.map((row) => ({
      id: row.id,
      productId: row.productId,
      sku: (row.sku ?? '').trim(),
      codAvailable: coerceDbBoolean(row.codAvailable),
      returnAllowed: coerceDbBoolean(row.returnAllowed),
      productRefId: row.productRefId,
      productSlug: row.productSlug,
      productCodAvailable: coerceDbBoolean(row.productCodAvailable),
      productReturnAllowed: coerceDbBoolean(row.productReturnAllowed),
    }));

    const variantsByProduct = new Map<string, VariantRow[]>();
    for (const variant of variants) {
      const list = variantsByProduct.get(variant.productId) ?? [];
      list.push(variant);
      variantsByProduct.set(variant.productId, list);
    }

    const matching: VariantRow[] = [];
    const matchedSkuKeys = new Set<string>();
    for (const variant of variants) {
      const key = skuKey(variant.sku);
      if (!key || !sheetSkuKeys.has(key)) continue;
      matching.push(variant);
      matchedSkuKeys.add(key);
    }

    const fullyCoveredProductIds = new Set<string>();
    for (const [productId, productVariants] of variantsByProduct) {
      if (
        productVariants.length > 0 &&
        productVariants.every((variant) => sheetSkuKeys.has(skuKey(variant.sku)))
      ) {
        fullyCoveredProductIds.add(productId);
      }
    }

    const productsWithMatch = new Set(matching.map((variant) => variant.productId));
    const partialProductIds = [...productsWithMatch].filter((id) => !fullyCoveredProductIds.has(id));

    const variantsChanging = matching.filter(
      (variant) => variant.codAvailable !== false || variant.returnAllowed !== false,
    );
    const alreadyFalse = matching.length - variantsChanging.length;

    const productsChangingIds = [...fullyCoveredProductIds].filter((productId) => {
      const sample = variantsByProduct.get(productId)?.[0];
      if (!sample) return false;
      return sample.productCodAvailable !== false || sample.productReturnAllowed !== false;
    });
    const productsChanging = new Set(productsChangingIds);

    const unmatchedRows = sheetRows.filter((row) => !matchedSkuKeys.has(skuKey(row.sku)));

    log(`${LOG_PREFIX} --- summary ---`);
    log(`${LOG_PREFIX} variants scanned:                         ${variants.length}`);
    log(`${LOG_PREFIX} matched variants:                         ${matching.length}`);
    log(`${LOG_PREFIX} already codAvailable=false and returnAllowed=false: ${alreadyFalse}`);
    log(`${LOG_PREFIX} variants that will change:                ${variantsChanging.length}`);
    log(`${LOG_PREFIX} unmatched sheet SKU rows:                 ${unmatchedRows.length}`);
    log(`${LOG_PREFIX} products fully covered (product flags):   ${fullyCoveredProductIds.size}`);
    log(`${LOG_PREFIX} products whose flags will change:         ${productsChanging.size}`);
    log(`${LOG_PREFIX} partial matches (product flags unchanged): ${partialProductIds.length}`);

    const unmatchedLines = [
      'ID,SKU,Name',
      ...unmatchedRows.map(
        (row) => `${csvEscape(row.externalId)},${csvEscape(row.sku)},${csvEscape(row.name)}`,
      ),
    ];
    const updatedLines = [
      'sku,productRefId,previousCodAvailable,previousReturnAllowed,productFlagsUpdated',
      ...variantsChanging.map(
        (variant) =>
          `${csvEscape(variant.sku)},${csvEscape(variant.productRefId)},${variant.codAvailable},${variant.returnAllowed},${productsChanging.has(variant.productId)}`,
      ),
    ];
    writeCsv(unmatchedPath, unmatchedLines);
    writeCsv(updatedPath, updatedLines);

    if (!opts.apply) {
      log(`${LOG_PREFIX} dry-run complete — re-run with --apply to persist`);
      log(`${LOG_PREFIX} unmatched CSV: ${unmatchedPath}`);
      log(`${LOG_PREFIX} updated CSV: ${updatedPath}`);
      log(`${LOG_PREFIX} log file: ${logPath}`);
      return;
    }

    let variantsUpdated = 0;
    let productsUpdated = 0;

    await AppDataSource.transaction(async (manager) => {
      const variantRepo = manager.getRepository(ProductVariantEntity);
      for (const ids of chunk(
        variantsChanging.map((variant) => variant.id),
        CHUNK_SIZE,
      )) {
        if (!ids.length) continue;
        await variantRepo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({ codAvailable: false, returnAllowed: false })
          .whereInIds(ids)
          .execute();
        variantsUpdated += ids.length;
        log(`${LOG_PREFIX} variants ${variantsUpdated}/${variantsChanging.length}`);
      }

      const productRepo = manager.getRepository(ProductEntity);
      for (const ids of chunk([...productsChanging], CHUNK_SIZE)) {
        if (!ids.length) continue;
        await productRepo
          .createQueryBuilder()
          .update(ProductEntity)
          .set({ codAvailable: false, returnAllowed: false })
          .whereInIds(ids)
          .execute();
        productsUpdated += ids.length;
        log(`${LOG_PREFIX} products ${productsUpdated}/${productsChanging.size}`);
      }
    });

    const changedProductIds = [
      ...new Set([
        ...variantsChanging.map((variant) => variant.productId),
        ...productsChanging,
      ]),
    ];

    let cacheKeysDeleted = 0;
    let redisConnected = false;
    if (changedProductIds.length) {
      const products = await AppDataSource.query<Array<{ ref_id: string; slug: string }>>(
        `SELECT ref_id, slug FROM products WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [changedProductIds],
      );
      const cacheResult = await invalidateProductCache(
        products.map((product) => ({ refId: product.ref_id, slug: product.slug })),
        false,
      );
      cacheKeysDeleted = cacheResult.keysDeleted;
      redisConnected = cacheResult.connected;
    }

    log(`${LOG_PREFIX} cacheKeysDeleted=${cacheKeysDeleted} redis=${redisConnected}`);

    const revalidateTargets = await loadRevalidateTargets(changedProductIds);
    await revalidateStorefront(revalidateTargets);

    log(`${LOG_PREFIX} --- apply complete ---`);
    log(`${LOG_PREFIX} variants marked no-COD and non-returnable: ${variantsUpdated}`);
    log(`${LOG_PREFIX} products marked no-COD and non-returnable: ${productsUpdated}`);
    log(`${LOG_PREFIX} unmatched sheet SKU rows:                  ${unmatchedRows.length}`);
    log(`${LOG_PREFIX} unmatched CSV: ${unmatchedPath}`);
    log(`${LOG_PREFIX} updated CSV: ${updatedPath}`);
    log(`${LOG_PREFIX} log file: ${logPath}`);
  } finally {
    flushLog(logPath);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`${LOG_PREFIX} failed:`, error);
    logLines.push(`${LOG_PREFIX} failed: ${detail}`);
    flushLog(absolutePath(LOG_FILE));
    process.exit(1);
  });
