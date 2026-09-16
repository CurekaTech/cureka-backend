/**
 * Temporarily drop / restore the active-SKU unique index so Combo packs can be
 * recreated as bundles while reusing SKUs that still exist on old simples.
 *
 * Pair with ALLOW_DUPLICATE_SKU_FOR_BUNDLES=true while the index is dropped.
 *
 * Usage:
 *   npm run product:sku-unique -- --drop
 *   npm run product:sku-unique -- --restore
 *   npm run product:sku-unique -- --status
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';

const UNIQUE_INDEX = 'UQ_product_variants_sku_active';

const printUsage = (): void => {
  console.log(`
product:sku-unique — Drop or restore UQ_product_variants_sku_active

  --drop      DROP INDEX IF EXISTS "${UNIQUE_INDEX}"
  --restore   Recreate unique index on sku WHERE deleted_at IS NULL
  --status    Show whether the index currently exists

Also set ALLOW_DUPLICATE_SKU_FOR_BUNDLES=true while dropped, then false after restore.
`);
};

type Mode = 'drop' | 'restore' | 'status';

const parseMode = (argv: string[]): Mode | null => {
  if (argv.includes('--drop')) return 'drop';
  if (argv.includes('--restore')) return 'restore';
  if (argv.includes('--status') || argv.includes('--help') || argv.includes('-h')) {
    if (argv.includes('--help') || argv.includes('-h')) {
      printUsage();
      process.exit(0);
    }
    return 'status';
  }
  return null;
};

async function indexExists(): Promise<boolean> {
  const rows = await AppDataSource.query<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = $1
     ) AS exists`,
    [UNIQUE_INDEX],
  );
  return Boolean(rows[0]?.exists);
}

async function run(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  if (!mode) {
    printUsage();
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    const before = await indexExists();
    console.log(`[sku-unique] index=${UNIQUE_INDEX} exists=${before} mode=${mode}`);

    if (mode === 'status') {
      return;
    }

    if (mode === 'drop') {
      if (!before) {
        console.log('[sku-unique] already dropped — nothing to do');
        return;
      }
      await AppDataSource.query(`DROP INDEX IF EXISTS "${UNIQUE_INDEX}"`);
      console.log('[sku-unique] dropped. Keep ALLOW_DUPLICATE_SKU_FOR_BUNDLES=true until restore.');
      return;
    }

    // restore
    if (before) {
      console.log('[sku-unique] already present — nothing to do');
      return;
    }

    const dupes = await AppDataSource.query<Array<{ sku: string; count: string }>>(
      `SELECT sku, COUNT(*)::text AS count
       FROM product_variants
       WHERE deleted_at IS NULL
       GROUP BY sku
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC
       LIMIT 20`,
    );

    if (dupes.length) {
      console.error(
        '[sku-unique] cannot restore — duplicate active SKUs still exist (first 20):',
        dupes,
      );
      console.error(
        '[sku-unique] soft-delete or rename conflicting variants, then re-run --restore',
      );
      process.exit(1);
    }

    await AppDataSource.query(
      `CREATE UNIQUE INDEX "${UNIQUE_INDEX}" ON "product_variants" ("sku") WHERE "deleted_at" IS NULL`,
    );
    console.log(
      '[sku-unique] restored. Set ALLOW_DUPLICATE_SKU_FOR_BUNDLES=false and restart the API.',
    );
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run().catch((error) => {
  console.error('[sku-unique] failed:', error);
  process.exit(1);
});
