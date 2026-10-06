/**
 * Mark sheet SKUs as no-COD and non-returnable.
 *
 * Sheet column:
 *   SKU → variant.sku  (case-insensitive; the only match key)
 *
 * Matching variants: codAvailable = false, returnAllowed = false.
 * returnWindowDays and returnPolicy are left unchanged on those variants.
 *
 * Active variants, and out-of-stock variants, whose SKU is not in the sheet:
 *   codAvailable = true, returnAllowed = true, returnWindowDays = 2.
 * Inactive variants that are not out of stock and are not in the sheet are left unchanged.
 *
 * When every non-deleted variant SKU of a product is in the sheet, the product
 * row is set the same way (codAvailable = false, returnAllowed = false).
 * When every active or out-of-stock variant SKU is absent from the sheet, the product
 * row is set to codAvailable = true, returnAllowed = true, returnWindowDays = 2.
 * Mixed products keep their product-level flags unchanged.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 * Both modes write unmatched and updated CSV reports plus a log file.
 *
 * Usage:
 *   npm run product:no-return-no-cod
 *   npm run product:no-return-no-cod -- --apply
 *   npm run product:no-return-no-cod -- --file="docs/Master-Data-Sheets/no-return-no-cod-02-10.xlsx" --apply
 *   npm run product:no-return-no-cod -- --test
 *   npm run product:no-return-no-cod -- --test --apply
 *   npm run product:no-return-no-cod -- --once
 *   npm run product:no-return-no-cod -- --test --test-file="docs/Master-Data-Sheets/another-test.xlsx"
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
const TEST_FILE = 'docs/Master-Data-Sheets/test-techbv.xlsx';
const EXPORT_DIR = 'docs/Master-Data-Sheets/exports';
const RETURN_WINDOW_DAYS = 2;
const CHUNK_SIZE = 500;
const REVALIDATE_BATCH = 32;
const LOG_PREFIX = '[no-return-no-cod]';
const ONCE_SCRIPT_KEY = 'product-no-return-no-cod-oos';

interface CliOptions {
  file: string;
  apply: boolean;
  test: boolean;
  once: boolean;
  sheet?: string;
  ignoredFile?: string;
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
  status: string;
  outOfStock: boolean;
  codAvailable: boolean;
  returnAllowed: boolean;
  returnWindowDays: number | null;
  productRefId: string;
  productSlug: string;
  productCodAvailable: boolean;
  productReturnAllowed: boolean;
  productReturnWindowDays: number | null;
}

interface RevalidateTarget {
  slug: string;
  path: string;
}

const skuKey = (sku: string): string => sku.trim().toLowerCase();

const toWindowDays = (value: number | string | null | undefined): number | null => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isActiveVariant = (variant: VariantRow): boolean => variant.status === 'active';

/** Active SKUs and OOS SKUs both receive COD / return updates. */
const isFlagTarget = (variant: VariantRow): boolean =>
  isActiveVariant(variant) || variant.outOfStock;

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
  --file <path>        XLSX file  (default: ${DEFAULT_FILE})
  --test               Use the TechBV test sheet instead of the default file. Does not write unless --apply is also passed.
  --test-file <path>   Sheet used with --test (default: ${TEST_FILE})
  --sheet <name>       Worksheet name (default: first sheet)
  --apply              Persist changes to DB and refresh cache (default: dry-run)
  --once               Deploy mode. Applies once per database, then skips. TechBV STOREFRONT_URL uses the test sheet; any other storefront uses the full sheet.
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { file: DEFAULT_FILE, apply: false, test: false, once: false };
  let testFile = TEST_FILE;
  let fileFromFlag: string | undefined;
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
    if (arg === '--once') {
      opts.once = true;
      continue;
    }
    if (arg === '--test') {
      opts.test = true;
      continue;
    }
    if (arg === '--file' || arg.startsWith('--file=')) {
      fileFromFlag = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? opts.file;
      continue;
    }
    if (arg === '--test-file' || arg.startsWith('--test-file=')) {
      testFile = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? testFile;
      continue;
    }
    if (arg === '--sheet' || arg.startsWith('--sheet=')) {
      opts.sheet = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
    }
  }

  if (opts.test) {
    opts.file = testFile;
    if (fileFromFlag && fileFromFlag !== testFile) {
      opts.ignoredFile = fileFromFlag;
    }
  } else if (fileFromFlag) {
    opts.file = fileFromFlag;
  }

  return opts;
};

const applyOnceTarget = (opts: CliOptions): void => {
  if (!opts.once) return;
  const storefrontUrl = process.env['STOREFRONT_URL']?.trim() ?? '';
  if (!storefrontUrl) {
    throw new Error(
      '--once requires STOREFRONT_URL so TechBV uses the test sheet and live uses the full sheet',
    );
  }
  opts.apply = true;
  opts.test = /techbv/i.test(storefrontUrl);
  opts.file = opts.test ? TEST_FILE : DEFAULT_FILE;
  opts.ignoredFile = undefined;
  log(`${LOG_PREFIX} --once storefront=${storefrontUrl}`);
  log(`${LOG_PREFIX} --once target=${opts.test ? 'techbv test sheet' : 'live full sheet'}`);
};

const ensureOnceTable = async (): Promise<void> => {
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS one_time_data_scripts (
      script_key varchar(200) PRIMARY KEY,
      environment varchar(50) NOT NULL,
      input_file text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

const findOnceRun = async (): Promise<{
  environment: string;
  input_file: string;
  applied_at: Date | string;
} | null> => {
  const rows = await AppDataSource.query<
    Array<{ environment: string; input_file: string; applied_at: Date | string }>
  >(
    `SELECT environment, input_file, applied_at
     FROM one_time_data_scripts
     WHERE script_key = $1`,
    [ONCE_SCRIPT_KEY],
  );
  return rows[0] ?? null;
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
    if (header === 'id' || header === 'product id') idCol = colNumber;
    else if (
      header === 'sku' ||
      header === 'sku code' ||
      header === 'product sku' ||
      header === 'product sku code'
    ) {
      skuCol = colNumber;
    } else if (header === 'name' || header === 'product name') nameCol = colNumber;
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
  applyOnceTarget(opts);
  const filePath = absolutePath(opts.file);
  const reportPrefix = opts.test ? 'no-return-no-cod-test' : 'no-return-no-cod';
  const unmatchedPath = absolutePath(`${EXPORT_DIR}/${reportPrefix}-unmatched.csv`);
  const updatedPath = absolutePath(`${EXPORT_DIR}/${reportPrefix}-updated.csv`);
  const logPath = absolutePath(`${EXPORT_DIR}/${reportPrefix}.log`);

  if (opts.test) {
    log(`${LOG_PREFIX} TEST MODE active`);
    log(`${LOG_PREFIX} TEST MODE input file=${filePath}`);
    log(`${LOG_PREFIX} TEST MODE does not write unless --apply is also passed`);
    if (opts.ignoredFile) {
      log(`${LOG_PREFIX} TEST MODE ignored --file=${opts.ignoredFile}`);
    }
  }
  log(`${LOG_PREFIX} file=${filePath}`);
  log(`${LOG_PREFIX} apply=${opts.apply}`);
  log(`${LOG_PREFIX} out-of-stock variants are included with active variants`);

  await AppDataSource.initialize();
  try {
    if (opts.once) {
      await ensureOnceTable();
      const existing = await findOnceRun();
      if (existing) {
        log(
          `${LOG_PREFIX} already applied once at ${existing.applied_at} environment=${existing.environment} file=${existing.input_file}; skipping`,
        );
        return;
      }
    }

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

  const rawVariants = await AppDataSource.query<
      Array<{
        id: string;
        productId: string;
        sku: string | null;
        status: string;
        outOfStock: boolean | string | number | null;
        codAvailable: boolean | string | number | null;
        returnAllowed: boolean | string | number | null;
        returnWindowDays: number | string | null;
        productRefId: string;
        productSlug: string;
        productCodAvailable: boolean | string | number | null;
        productReturnAllowed: boolean | string | number | null;
        productReturnWindowDays: number | string | null;
      }>
    >(
      `
      SELECT
        v.id,
        v.product_id AS "productId",
        v.sku,
        v.status,
        v.out_of_stock AS "outOfStock",
        v.cod_available AS "codAvailable",
        v.return_allowed AS "returnAllowed",
        v.return_window_days AS "returnWindowDays",
        p.ref_id AS "productRefId",
        p.slug AS "productSlug",
        p.cod_available AS "productCodAvailable",
        p.return_allowed AS "productReturnAllowed",
        p.return_window_days AS "productReturnWindowDays"
      FROM product_variants v
      INNER JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
      WHERE v.deleted_at IS NULL
      `,
    );

    const variants: VariantRow[] = rawVariants.map((row) => ({
      id: row.id,
      productId: row.productId,
      sku: (row.sku ?? '').trim(),
      status: row.status,
      outOfStock: coerceDbBoolean(row.outOfStock),
      codAvailable: coerceDbBoolean(row.codAvailable),
      returnAllowed: coerceDbBoolean(row.returnAllowed),
      returnWindowDays: toWindowDays(row.returnWindowDays),
      productRefId: row.productRefId,
      productSlug: row.productSlug,
      productCodAvailable: coerceDbBoolean(row.productCodAvailable),
      productReturnAllowed: coerceDbBoolean(row.productReturnAllowed),
      productReturnWindowDays: toWindowDays(row.productReturnWindowDays),
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
    const fullyOutsideProductIds = new Set<string>();
    for (const [productId, productVariants] of variantsByProduct) {
      if (
        productVariants.length > 0 &&
        productVariants.every((variant) => sheetSkuKeys.has(skuKey(variant.sku)))
      ) {
        fullyCoveredProductIds.add(productId);
      }

      const flagTargets = productVariants.filter(isFlagTarget);
      if (
        flagTargets.length > 0 &&
        flagTargets.every((variant) => !sheetSkuKeys.has(skuKey(variant.sku)))
      ) {
        fullyOutsideProductIds.add(productId);
      }
    }

    const productsWithMatch = new Set(matching.map((variant) => variant.productId));
    const partialProductIds = [...productsWithMatch].filter((id) => !fullyCoveredProductIds.has(id));

    const variantsChanging = matching.filter(
      (variant) => variant.codAvailable !== false || variant.returnAllowed !== false,
    );
    const alreadyFalse = matching.length - variantsChanging.length;

    const variantsOutside = variants.filter(
      (variant) => isFlagTarget(variant) && !sheetSkuKeys.has(skuKey(variant.sku)),
    );
    const variantsResetting = variantsOutside.filter(
      (variant) =>
        variant.codAvailable !== true ||
        variant.returnAllowed !== true ||
        variant.returnWindowDays !== RETURN_WINDOW_DAYS,
    );
    const alreadyReturnable = variantsOutside.length - variantsResetting.length;

    const productsChangingIds = [...fullyCoveredProductIds].filter((productId) => {
      const sample = variantsByProduct.get(productId)?.[0];
      if (!sample) return false;
      return sample.productCodAvailable !== false || sample.productReturnAllowed !== false;
    });
    const productsChanging = new Set(productsChangingIds);

    const productsResettingIds = [...fullyOutsideProductIds].filter((productId) => {
      const sample = variantsByProduct.get(productId)?.find(isFlagTarget);
      if (!sample) return false;
      return (
        sample.productCodAvailable !== true ||
        sample.productReturnAllowed !== true ||
        sample.productReturnWindowDays !== RETURN_WINDOW_DAYS
      );
    });
    const productsResetting = new Set(productsResettingIds);

    const unmatchedRows = sheetRows.filter((row) => !matchedSkuKeys.has(skuKey(row.sku)));

    log(`${LOG_PREFIX} --- summary ---`);
    log(`${LOG_PREFIX} variants scanned:                         ${variants.length}`);
    log(`${LOG_PREFIX} matched variants:                         ${matching.length}`);
    log(`${LOG_PREFIX} already codAvailable=false and returnAllowed=false: ${alreadyFalse}`);
    log(`${LOG_PREFIX} matched variants that will change:        ${variantsChanging.length}`);
    log(`${LOG_PREFIX} active or OOS variants not in sheet:      ${variantsOutside.length}`);
    log(`${LOG_PREFIX} already codAvailable=true, returnAllowed=true, returnWindowDays=${RETURN_WINDOW_DAYS}: ${alreadyReturnable}`);
    log(`${LOG_PREFIX} active or OOS variants that will reset:   ${variantsResetting.length}`);
    log(`${LOG_PREFIX} unmatched sheet SKU rows:                 ${unmatchedRows.length}`);
    log(`${LOG_PREFIX} products fully covered (product flags false): ${fullyCoveredProductIds.size}`);
    log(`${LOG_PREFIX} products whose flags will be set false:   ${productsChanging.size}`);
    log(`${LOG_PREFIX} products with every active or OOS SKU absent: ${fullyOutsideProductIds.size}`);
    log(`${LOG_PREFIX} products whose flags will be set true:    ${productsResetting.size}`);
    log(`${LOG_PREFIX} partial matches (product flags unchanged): ${partialProductIds.length}`);

    const updatedRow = (
      variant: VariantRow,
      action: 'in-sheet' | 'not-in-sheet',
      productFlagsUpdated: boolean,
    ): string =>
      [
        csvEscape(variant.sku),
        csvEscape(variant.productRefId),
        action,
        variant.codAvailable,
        variant.returnAllowed,
        variant.returnWindowDays ?? '',
        productFlagsUpdated,
      ].join(',');

    const unmatchedLines = [
      'ID,SKU,Name',
      ...unmatchedRows.map(
        (row) => `${csvEscape(row.externalId)},${csvEscape(row.sku)},${csvEscape(row.name)}`,
      ),
    ];
    const updatedLines = [
      'sku,productRefId,action,previousCodAvailable,previousReturnAllowed,previousReturnWindowDays,productFlagsUpdated',
      ...variantsChanging.map((variant) =>
        updatedRow(variant, 'in-sheet', productsChanging.has(variant.productId)),
      ),
      ...variantsResetting.map((variant) =>
        updatedRow(variant, 'not-in-sheet', productsResetting.has(variant.productId)),
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
    let variantsReset = 0;
    let productsUpdated = 0;
    let productsReset = 0;

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
        log(`${LOG_PREFIX} in-sheet variants ${variantsUpdated}/${variantsChanging.length}`);
      }

      for (const ids of chunk(
        variantsResetting.map((variant) => variant.id),
        CHUNK_SIZE,
      )) {
        if (!ids.length) continue;
        await variantRepo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({
            codAvailable: true,
            returnAllowed: true,
            returnWindowDays: RETURN_WINDOW_DAYS,
          })
          .whereInIds(ids)
          .andWhere('(status = :status OR out_of_stock = true)', { status: 'active' })
          .execute();
        variantsReset += ids.length;
        log(`${LOG_PREFIX} not-in-sheet variants ${variantsReset}/${variantsResetting.length}`);
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
        log(`${LOG_PREFIX} in-sheet products ${productsUpdated}/${productsChanging.size}`);
      }

      for (const ids of chunk([...productsResetting], CHUNK_SIZE)) {
        if (!ids.length) continue;
        await productRepo
          .createQueryBuilder()
          .update(ProductEntity)
          .set({
            codAvailable: true,
            returnAllowed: true,
            returnWindowDays: RETURN_WINDOW_DAYS,
          })
          .whereInIds(ids)
          .execute();
        productsReset += ids.length;
        log(`${LOG_PREFIX} not-in-sheet products ${productsReset}/${productsResetting.size}`);
      }

      if (opts.once) {
        await manager.query(
          `INSERT INTO one_time_data_scripts (script_key, environment, input_file)
           VALUES ($1, $2, $3)
           ON CONFLICT (script_key) DO NOTHING`,
          [ONCE_SCRIPT_KEY, opts.test ? 'techbv' : 'live', opts.file],
        );
        log(`${LOG_PREFIX} recorded one-time run key=${ONCE_SCRIPT_KEY}`);
      }
    });

    const changedProductIds = [
      ...new Set([
        ...variantsChanging.map((variant) => variant.productId),
        ...variantsResetting.map((variant) => variant.productId),
        ...productsChanging,
        ...productsResetting,
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
    log(`${LOG_PREFIX} active variants reset to COD and returnable (${RETURN_WINDOW_DAYS} days): ${variantsReset}`);
    log(`${LOG_PREFIX} products marked no-COD and non-returnable: ${productsUpdated}`);
    log(`${LOG_PREFIX} products reset to COD and returnable (${RETURN_WINDOW_DAYS} days): ${productsReset}`);
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
    const failedLog =
      process.argv.includes('--test') ||
      (process.argv.includes('--once') && /techbv/i.test(process.env['STOREFRONT_URL'] ?? ''))
        ? `${EXPORT_DIR}/no-return-no-cod-test.log`
        : `${EXPORT_DIR}/no-return-no-cod.log`;
    flushLog(absolutePath(failedLog));
    process.exit(1);
  });
