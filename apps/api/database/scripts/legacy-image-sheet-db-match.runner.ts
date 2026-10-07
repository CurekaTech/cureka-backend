/**
 * Read-only check: sheet SKU + Product ID against variant.sku and
 * variant.externalProductId. Logs at most 50 matching pairs. Writes nothing.
 *
 * Usage:
 *   npm run product:legacy-image-sheet-matches
 *   npm run product:legacy-image-sheet-matches -- --limit=50
 */
import 'reflect-metadata';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import {
  normalizeLookupProductId,
  normalizeLookupSku,
} from '../../../../modules/product/utils/bulk-upload-reference-lookup.util';
import { loadIdSkuImageSheet } from '../../../../modules/product/utils/legacy-image-reconcile.util';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/legacy-image-urls-10-09.xlsx';
const DEFAULT_LIMIT = 50;

interface CliOptions {
  file: string;
  limit: number;
}

const absolutePath = (filePath: string): string =>
  isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { file: DEFAULT_FILE, limit: DEFAULT_LIMIT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const valueOf = (): string =>
      arg.includes('=') ? arg.split('=').slice(1).join('=') : (argv[++index] ?? '');
    if (arg === '--help' || arg === '-h') {
      console.log(`
Read the legacy image sheet and log SKU + Product ID pairs that match a variant.

  npm run product:legacy-image-sheet-matches
  npm run product:legacy-image-sheet-matches -- --limit=50

Options:
  --file <path>   Workbook (default: ${DEFAULT_FILE})
  --limit <n>     Max pairs to log (default: ${DEFAULT_LIMIT})
`);
      process.exit(0);
    }
    if (arg === '--file' || arg.startsWith('--file=')) options.file = valueOf();
    else if (arg === '--limit' || arg.startsWith('--limit=')) {
      const limit = Number(valueOf());
      if (Number.isFinite(limit) && limit > 0) options.limit = Math.trunc(limit);
    }
  }
  return options;
};

const pairKey = (sku: string, productId: string): string => `${sku}\0${productId}`;

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  const sheetRows = await loadIdSkuImageSheet(absolutePath(options.file));
  const sheetPairs = new Map<string, { sku: string; productId: string }>();

  for (const row of sheetRows) {
    const sku = normalizeLookupSku(row.sku);
    const productId = normalizeLookupProductId(row.productId);
    if (!sku || !productId) continue;
    const key = pairKey(sku, productId);
    if (!sheetPairs.has(key)) {
      sheetPairs.set(key, { sku: row.sku.trim(), productId: row.productId.trim() });
    }
  }

  await AppDataSource.initialize();
  try {
    const variants = await AppDataSource.getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .select(['variant.sku', 'variant.externalProductId'])
      .where('variant.externalProductId IS NOT NULL')
      .andWhere("TRIM(variant.externalProductId) <> ''")
      .getMany();

    const matches: Array<{ sku: string; productId: string }> = [];
    const seen = new Set<string>();
    for (const variant of variants) {
      const sku = normalizeLookupSku(variant.sku);
      const productId = normalizeLookupProductId(variant.externalProductId);
      if (!sku || !productId) continue;
      const key = pairKey(sku, productId);
      if (!sheetPairs.has(key) || seen.has(key)) continue;
      seen.add(key);
      matches.push({
        sku: variant.sku.trim(),
        productId: String(variant.externalProductId).trim(),
      });
    }

    matches.sort((left, right) =>
      left.sku === right.sku
        ? left.productId.localeCompare(right.productId)
        : left.sku.localeCompare(right.sku),
    );
    const logged = matches.slice(0, options.limit);

    console.log(`Sheet rows with both SKU and Product ID: ${sheetPairs.size}`);
    console.log(
      `DB matches on variant.sku and variant.externalProductId: ${matches.length}`,
    );
    console.log(`Logging ${logged.length} of ${matches.length} (limit ${options.limit})`);
    for (const row of logged) {
      console.log(`sku=${row.sku} productId=${row.productId}`);
    }
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
