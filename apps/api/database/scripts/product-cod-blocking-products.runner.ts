/**
 * Update parent product COD/return flags for products fully covered by the
 * COD-blocking SKU sheet. Mixed products are left unchanged so unlisted
 * variants are not blocked by the parent-level return policy.
 *
 * Sheet column: sku_ids. Excel values are trimmed; matching is exact and
 * case-sensitive, consistent with product:cod-blocking.
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/CODBLOCKINGSKUS-09-10.xlsx';
const CHUNK_SIZE = 500;
const LOG_PREFIX = '[cod-blocking-products]';

interface CliOptions {
  file: string;
  apply: boolean;
  sheet?: string;
}

interface ProductVariantRow {
  productId: string;
  sku: string | null;
  refId: string;
  slug: string;
  codAvailable: boolean;
  returnAllowed: boolean;
  returnPolicy: string | null;
  returnWindowDays: number | null;
}

interface ProductTarget {
  id: string;
  refId: string;
  slug: string;
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
  return String(value);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { file: DEFAULT_FILE, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--help' || arg === '-h') {
      console.log([
        'product:cod-blocking:products — Update parent flags for fully covered products',
        '',
        'Options:',
        `  --file <path>   XLSX file (default: ${DEFAULT_FILE})`,
        '  --sheet <name>  Worksheet name (default: first sheet)',
        '  --apply         Persist changes and invalidate product caches (default: dry-run)',
        '',
      ].join('\n'));
      process.exit(0);
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--file' || arg.startsWith('--file=')) {
      options.file = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++index] ?? options.file;
      continue;
    }
    if (arg === '--sheet' || arg.startsWith('--sheet=')) {
      options.sheet = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++index];
    }
  }
  return options;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const readSkus = async (
  filePath: string,
  sheetName?: string,
): Promise<{ rowsRead: number; duplicates: number; blankSkipped: number; skus: string[] }> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = sheetName
    ? (workbook.getWorksheet(sheetName) ?? workbook.worksheets[0])
    : workbook.worksheets[0];
  if (!worksheet) throw new Error(`No worksheet found in ${filePath}`);

  let skuColumn = 0;
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    if (cellText(cell).trim().toLowerCase() === 'sku_ids') skuColumn = column;
  });
  if (!skuColumn) throw new Error(`Could not find required column "sku_ids" in sheet "${worksheet.name}"`);

  const counts = new Map<string, number>();
  let rowsRead = 0;
  let blankSkipped = 0;
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const raw = cellText(worksheet.getRow(rowNumber).getCell(skuColumn));
    if (!raw) continue;
    rowsRead += 1;
    const sku = raw.trim();
    if (!sku) {
      blankSkipped += 1;
      continue;
    }
    counts.set(sku, (counts.get(sku) ?? 0) + 1);
  }

  return {
    rowsRead,
    duplicates: [...counts.values()].reduce((sum, count) => sum + count - 1, 0),
    blankSkipped,
    skus: [...counts.keys()],
  };
};

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  const filePath = absolutePath(options.file);
  console.log(`${LOG_PREFIX} file=${filePath}`);
  console.log(`${LOG_PREFIX} apply=${options.apply}`);

  const sheet = await readSkus(filePath, options.sheet);
  if (!sheet.skus.length) throw new Error('Sheet has no non-empty sku_ids values');
  const sheetSkuSet = new Set(sheet.skus);
  console.log(`${LOG_PREFIX} sku rows read=${sheet.rowsRead}`);
  console.log(`${LOG_PREFIX} unique SKUs=${sheet.skus.length}`);
  console.log(`${LOG_PREFIX} duplicate SKU entries skipped=${sheet.duplicates}`);
  console.log(`${LOG_PREFIX} blank SKU entries skipped=${sheet.blankSkipped}`);

  await AppDataSource.initialize();
  try {
    const variants = await AppDataSource.query<ProductVariantRow[]>(`
      SELECT v.product_id AS "productId", v.sku,
             p.ref_id AS "refId", p.slug,
             p.cod_available AS "codAvailable",
             p.return_allowed AS "returnAllowed",
             p.return_policy AS "returnPolicy",
             p.return_window_days AS "returnWindowDays"
      FROM product_variants v
      INNER JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
      WHERE v.deleted_at IS NULL
    `);

    const variantsByProduct = new Map<string, ProductVariantRow[]>();
    for (const variant of variants) {
      const productVariants = variantsByProduct.get(variant.productId) ?? [];
      productVariants.push(variant);
      variantsByProduct.set(variant.productId, productVariants);
    }

    const matchedVariants = variants.filter((variant) =>
      sheetSkuSet.has(variant.sku?.trim() ?? ''),
    );
    const matchedSkuSet = new Set(matchedVariants.map((variant) => variant.sku?.trim() ?? ''));
    const unmatchedSkus = sheet.skus.filter((sku) => !matchedSkuSet.has(sku));
    const matchedProductIds = new Set(matchedVariants.map((variant) => variant.productId));
    const fullyCovered: ProductTarget[] = [];
    const partial: ProductTarget[] = [];

    for (const productId of matchedProductIds) {
      const productVariants = variantsByProduct.get(productId) ?? [];
      const sample = productVariants[0];
      if (!sample || productVariants.length === 0) continue;
      const product: ProductTarget = {
        id: productId,
        refId: sample.refId,
        slug: sample.slug,
        codAvailable: sample.codAvailable,
        returnAllowed: sample.returnAllowed,
        returnPolicy: sample.returnPolicy,
        returnWindowDays: sample.returnWindowDays,
      };
      if (productVariants.every((variant) => sheetSkuSet.has(variant.sku?.trim() ?? ''))) {
        fullyCovered.push(product);
      } else {
        partial.push(product);
      }
    }

    const toUpdate = fullyCovered.filter(
      (product) =>
        product.codAvailable !== false ||
        product.returnAllowed !== false ||
        product.returnPolicy != null ||
        product.returnWindowDays != null,
    );
    const alreadyRestricted = fullyCovered.length - toUpdate.length;

    console.log(`${LOG_PREFIX} matching variants=${matchedVariants.length}`);
    console.log(`${LOG_PREFIX} matching products fully covered=${fullyCovered.length}`);
    console.log(`${LOG_PREFIX} products needing parent update=${toUpdate.length}`);
    console.log(`${LOG_PREFIX} products already parent-restricted=${alreadyRestricted}`);
    console.log(`${LOG_PREFIX} mixed products left unchanged=${partial.length}`);
    console.log(`${LOG_PREFIX} SKUs not found=${unmatchedSkus.length}`);
    for (const product of partial) {
      console.log(`${LOG_PREFIX} parent left unchanged (unlisted sibling SKU) refId=${product.refId}`);
    }
    for (const sku of unmatchedSkus) {
      console.log(`${LOG_PREFIX} SKU not found: ${sku}`);
    }

    if (!options.apply) {
      console.log(`${LOG_PREFIX} dry-run complete — no database or cache changes`);
      return;
    }

    let updated = 0;
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductEntity);
      for (const ids of chunk(toUpdate.map((product) => product.id), CHUNK_SIZE)) {
        const result = await repo
          .createQueryBuilder()
          .update(ProductEntity)
          .set({
            codAvailable: false,
            returnAllowed: false,
            returnPolicy: null,
            returnWindowDays: null,
          })
          .where('id IN (:...ids)', { ids })
          .andWhere('deleted_at IS NULL')
          .execute();
        updated += result.affected ?? 0;
      }
    });
    console.log(`${LOG_PREFIX} parent products updated=${updated}`);

    if (toUpdate.length) {
      try {
        const cache = await invalidateProductCache(
          toUpdate.map(({ refId, slug }) => ({ refId, slug })),
          false,
        );
        console.log(`${LOG_PREFIX} cache keys deleted=${cache.keysDeleted}`);
        console.log(`${LOG_PREFIX} products whose caches were invalidated=${cache.connected ? toUpdate.length : 0}`);
        if (!cache.connected) {
          console.error(`${LOG_PREFIX} database update succeeded but Redis was unavailable`);
          console.error(`${LOG_PREFIX} recover with: npm run cache:invalidate-products`);
          process.exitCode = 1;
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} cache invalidation failed`, error);
        console.error(`${LOG_PREFIX} recover with: npm run cache:invalidate-products`);
        process.exitCode = 1;
      }
    }
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
};

main().catch((error: unknown) => {
  console.error(`${LOG_PREFIX} failed`, error);
  process.exitCode = 1;
});