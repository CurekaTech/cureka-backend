/**
 * Disable COD and returns for variants listed in the COD-blocking Excel sheet.
 *
 * Sheet column:
 *   sku_ids → variant.sku
 *   Exact, case-sensitive match after trimming the Excel cell only.
 *   HER/ZIN/08945 matches only HER/ZIN/08945.
 *
 * Matching variants:
 *   codAvailable = false
 *   returnAllowed = false
 *   returnPolicy = null
 *   returnWindowDays = null
 *
 * Variants that are not an exact SKU match are left unchanged.
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:cod-blocking
 *   npm run product:cod-blocking -- --apply
 *   npm run product:cod-blocking -- --file="docs/Master-Data-Sheets/CODBLOCKINGSKUS-09-10.xlsx" --apply
 *
 * Requires DATABASE_URL. Cache invalidation also uses REDIS_HOST, REDIS_PORT,
 * REDIS_PASSWORD, REDIS_USERNAME, and REDIS_TLS from .env.
 *
 * If the database update succeeds and Redis invalidation fails, rerun:
 *   npm run cache:invalidate-products
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/CODBLOCKINGSKUS-09-10.xlsx';
const CHUNK_SIZE = 500;
const LOG_PREFIX = '[cod-blocking]';

interface CliOptions {
  file: string;
  apply: boolean;
  sheet?: string;
}

interface VariantMatch {
  id: string;
  productId: string;
  sku: string;
  codAvailable: boolean;
  returnAllowed: boolean;
  returnPolicy: string | null;
  returnWindowDays: number | null;
}

const absolutePath = (filePath: string): string =>
  isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if (typeof value === 'object' && 'text' in value) {
    return String((value as { text: string }).text);
  }
  if (typeof value === 'object' && 'result' in value) {
    return String((value as { result: unknown }).result ?? '');
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value);
};

const printUsage = (): void => {
  console.log(`
product:cod-blocking — Disable COD and returns for exact SKUs in sku_ids

Options:
  --file <path>   XLSX file (default: ${DEFAULT_FILE})
  --sheet <name>  Worksheet name (default: first sheet)
  --apply         Persist changes and invalidate product caches (default: dry-run)
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

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
};

const alreadyRestricted = (variant: VariantMatch): boolean =>
  variant.codAvailable === false &&
  variant.returnAllowed === false &&
  variant.returnPolicy == null &&
  variant.returnWindowDays == null;

const readSkuIds = async (
  filePath: string,
  sheetName?: string,
): Promise<{
  rowsRead: number;
  blankSkipped: number;
  duplicateExtras: number;
  uniqueSkus: string[];
}> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? (workbook.getWorksheet(sheetName) ?? workbook.worksheets[0])
    : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`No worksheet found in ${filePath}`);
  }

  let skuCol = 0;
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = cellText(cell).trim().toLowerCase();
    if (header === 'sku_ids') skuCol = colNumber;
  });

  if (!skuCol) {
    const found = (worksheet.getRow(1).values as Array<string | undefined> | undefined)
      ?.slice(1)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Could not find required column "sku_ids" in sheet "${worksheet.name}". Found: ${found || '(none)'}`,
    );
  }

  console.log(`${LOG_PREFIX} column "sku_ids"=${skuCol} in sheet "${worksheet.name}"`);

  const counts = new Map<string, number>();
  let rowsRead = 0;
  let blankSkipped = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const raw = cellText(worksheet.getRow(rowNumber).getCell(skuCol));
    if (raw === '') {
      continue;
    }
    rowsRead += 1;
    const sku = raw.trim();
    if (!sku) {
      blankSkipped += 1;
      continue;
    }
    counts.set(sku, (counts.get(sku) ?? 0) + 1);
  }

  const uniqueSkus = [...counts.keys()];
  const duplicateExtras = [...counts.values()].reduce((sum, count) => sum + (count - 1), 0);

  return { rowsRead, blankSkipped, duplicateExtras, uniqueSkus };
};

async function findVariants(skus: string[]): Promise<VariantMatch[]> {
  const repo = AppDataSource.getRepository(ProductVariantEntity);
  const matches: VariantMatch[] = [];

  for (const skuBatch of chunk(skus, CHUNK_SIZE)) {
    const rows = await repo
      .createQueryBuilder('v')
      .select([
        'v.id',
        'v.productId',
        'v.sku',
        'v.codAvailable',
        'v.returnAllowed',
        'v.returnPolicy',
        'v.returnWindowDays',
      ])
      .where('v.deletedAt IS NULL')
      .andWhere('v.sku IN (:...skus)', { skus: skuBatch })
      .getMany();

    for (const row of rows) {
      matches.push({
        id: row.id,
        productId: row.productId,
        sku: row.sku,
        codAvailable: row.codAvailable,
        returnAllowed: row.returnAllowed,
        returnPolicy: row.returnPolicy,
        returnWindowDays: row.returnWindowDays,
      });
    }
  }

  return matches;
}

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`${LOG_PREFIX} file=${filePath}`);
  console.log(`${LOG_PREFIX} apply=${opts.apply}`);

  const sheet = await readSkuIds(filePath, opts.sheet);
  if (!sheet.uniqueSkus.length) {
    throw new Error('Sheet has no non-empty sku_ids values');
  }

  console.log(`${LOG_PREFIX} sku rows read=${sheet.rowsRead}`);
  console.log(`${LOG_PREFIX} unique SKUs=${sheet.uniqueSkus.length}`);
  console.log(`${LOG_PREFIX} duplicate SKU entries skipped=${sheet.duplicateExtras}`);
  console.log(`${LOG_PREFIX} blank SKU entries skipped=${sheet.blankSkipped}`);

  await AppDataSource.initialize();
  try {
    const matches = await findVariants(sheet.uniqueSkus);
    const matchedSkus = new Set(matches.map((variant) => variant.sku));
    const notFound = sheet.uniqueSkus.filter((sku) => !matchedSkus.has(sku));
    const already = matches.filter(alreadyRestricted);
    const toUpdate = matches.filter((variant) => !alreadyRestricted(variant));

    console.log(`${LOG_PREFIX} --- summary before updates ---`);
    console.log(`  Total SKU rows read:                         ${sheet.rowsRead}`);
    console.log(`  Unique SKUs:                                 ${sheet.uniqueSkus.length}`);
    console.log(`  Duplicate or blank SKU entries skipped:      ${sheet.duplicateExtras + sheet.blankSkipped}`);
    console.log(`  Matching variants:                           ${matches.length}`);
    console.log(`  Variants already restricted:                 ${already.length}`);
    console.log(`  Variants that need an update:                ${toUpdate.length}`);
    console.log(`  SKUs not found:                              ${notFound.length}`);

    if (notFound.length) {
      console.log(`${LOG_PREFIX} SKUs not found:`);
      for (const sku of notFound) {
        console.log(`  ${sku}`);
      }
    }

    if (!opts.apply) {
      console.log(
        `${LOG_PREFIX} dry-run sample:`,
        JSON.stringify(
          toUpdate.slice(0, 10).map((variant) => ({
            sku: variant.sku,
            codAvailable: variant.codAvailable,
            returnAllowed: variant.returnAllowed,
            returnPolicy: variant.returnPolicy,
            returnWindowDays: variant.returnWindowDays,
          })),
          null,
          2,
        ),
      );
      console.log(`${LOG_PREFIX} dry-run complete — no database or cache changes. Re-run with --apply to persist.`);
      console.log(`  Variants successfully updated:               0`);
      console.log(`  Products whose caches were invalidated:      0`);
      return;
    }

    let updated = 0;
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductVariantEntity);
      for (const ids of chunk(
        toUpdate.map((variant) => variant.id),
        CHUNK_SIZE,
      )) {
        if (!ids.length) continue;
        const result = await repo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({
            codAvailable: false,
            returnAllowed: false,
            returnPolicy: null,
            returnWindowDays: null,
          })
          .where('id IN (:...ids)', { ids })
          .execute();

        if (typeof result.affected !== 'number') {
          throw new Error('Database update did not report how many variants were changed');
        }
        updated += result.affected;
        console.log(`${LOG_PREFIX} updated ${updated}/${toUpdate.length}`);
      }
    });

    const changedProductIds = [...new Set(toUpdate.map((variant) => variant.productId))];
    let productsInvalidated = 0;
    let cacheKeysDeleted = 0;
    let cacheError: unknown = null;

    if (changedProductIds.length) {
      const products = await AppDataSource.query<Array<{ ref_id: string }>>(
        `SELECT ref_id FROM products WHERE id = ANY($1)`,
        [changedProductIds],
      );
      try {
        const cacheResult = await invalidateProductCache(
          products.map((product) => ({ refId: product.ref_id })),
          false,
        );
        cacheKeysDeleted = cacheResult.keysDeleted;
        productsInvalidated = cacheResult.connected ? products.length : 0;
        if (!cacheResult.connected) {
          cacheError = new Error('Redis unavailable');
        }
      } catch (error) {
        cacheError = error;
      }

      if (cacheError) {
        console.error(`${LOG_PREFIX} database update succeeded but cache invalidation failed`);
        console.error(
          `${LOG_PREFIX} affected product ref ids: ${products.map((product) => product.ref_id).join(', ')}`,
        );
        console.error(
          `${LOG_PREFIX} affected variant ids: ${toUpdate.map((variant) => variant.id).join(', ')}`,
        );
        console.error(cacheError);
        console.error(`${LOG_PREFIX} recover with: npm run cache:invalidate-products`);
      }
    }

    console.log(`${LOG_PREFIX} --- apply complete ---`);
    console.log(`  Total SKU rows read:                         ${sheet.rowsRead}`);
    console.log(`  Unique SKUs processed:                       ${sheet.uniqueSkus.length}`);
    console.log(`  Variants successfully updated:               ${updated}`);
    console.log(`  Variants already restricted:                 ${already.length}`);
    console.log(`  SKUs not found:                              ${notFound.length}`);
    console.log(`  Duplicate or blank SKU entries skipped:      ${sheet.duplicateExtras + sheet.blankSkipped}`);
    console.log(`  Products whose caches were invalidated:      ${productsInvalidated}`);
    console.log(`  Cache keys deleted:                          ${cacheKeysDeleted}`);
    console.log(`  Database failures:                           0`);
    console.log(`  Cache invalidation failures:                 ${cacheError ? 1 : 0}`);

    if (cacheError) {
      process.exitCode = 1;
    }
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run()
  .then(() => {
    if (process.exitCode && process.exitCode !== 0) {
      process.exit(process.exitCode);
    }
  })
  .catch((error) => {
    console.error(`${LOG_PREFIX} failed:`, error);
    process.exit(1);
  });
