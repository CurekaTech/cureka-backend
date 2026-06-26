/**
 * Product cleanup script — permanently removes products and related data from PostgreSQL
 * and invalidates product cache keys in Redis.
 *
 * Usage:
 *   npm run product:cleanup -- --ref-ids=SUN20261234,SUN20264567
 *   npm run product:cleanup -- --ref-ids SUN20261234 SUN20264567
 *   npm run product:cleanup -- --all --dry-run
 *   npm run product:cleanup -- --all --confirm
 *   npm run product:cleanup -- --all --confirm --force
 *
 * Flags:
 *   --ref-ids       Comma-separated or space-separated product refIds
 *   --all           Target every product (including soft-deleted rows)
 *   --dry-run       Print what would be deleted without changing DB/cache
 *   --confirm       Required with --all for destructive runs (ignored with --dry-run)
 *   --force         Also delete order_items that block hard delete (irreversible)
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { runProductCleanup } from './product-cleanup.service';

interface CliOptions {
  refIds: string[];
  all: boolean;
  dryRun: boolean;
  confirm: boolean;
  force: boolean;
}

const printUsage = (): void => {
  console.log(`
Product cleanup script

Examples:
  npm run product:cleanup -- --ref-ids=SUN20261234,SUN20264567
  npm run product:cleanup -- --ref-ids SUN20261234 SUN20264567
  npm run product:cleanup -- --all --dry-run
  npm run product:cleanup -- --all --confirm
  npm run product:cleanup -- --all --confirm --force

Options:
  --ref-ids <ids>   One or more product refIds
  --all             Clean all products
  --dry-run         Preview only
  --confirm         Required when using --all without --dry-run
  --force           Delete order_items that block product removal
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    refIds: [],
    all: false,
    dryRun: false,
    confirm: false,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--all') {
      options.all = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--confirm') {
      options.confirm = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg.startsWith('--ref-ids=')) {
      const value = arg.slice('--ref-ids='.length);
      options.refIds.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
      continue;
    }

    if (arg === '--ref-ids') {
      while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
        index += 1;
        options.refIds.push(argv[index]);
      }
    }
  }

  return options;
};

const validateCli = (options: CliOptions): void => {
  if (!options.all && options.refIds.length === 0) {
    printUsage();
    throw new Error('Provide --ref-ids or --all.');
  }

  if (options.all && options.refIds.length > 0) {
    throw new Error('Use either --all or --ref-ids, not both.');
  }

  if (options.all && !options.dryRun && !options.confirm) {
    throw new Error('Deleting all products requires --confirm (or use --dry-run first).');
  }
};

const printSummary = (
  results: Awaited<ReturnType<typeof runProductCleanup>>['results'],
  cache: Awaited<ReturnType<typeof runProductCleanup>>['cache'],
  dryRun: boolean,
): void => {
  const deleted = results.filter((item) => item.status === 'deleted');
  const skipped = results.filter((item) => item.status === 'skipped');
  const notFound = results.filter((item) => item.status === 'not_found');

  console.log('\n[product-cleanup] Summary');
  console.log(`  ${dryRun ? 'Would delete' : 'Deleted'} : ${deleted.length}`);
  console.log(`  Skipped : ${skipped.length}`);
  console.log(`  Missing : ${notFound.length}`);

  if (deleted.length > 0) {
    console.log(`\n  ${dryRun ? 'Products that would be deleted' : 'Deleted products'}:`);
    for (const item of deleted) {
      console.log(`    - ${item.refId} (${item.slug})`);
    }
  }

  if (skipped.length > 0) {
    console.log('\n  Skipped products:');
    for (const item of skipped) {
      console.log(`    - ${item.refId}${item.slug ? ` (${item.slug})` : ''}: ${item.reason}`);
    }
  }

  if (notFound.length > 0) {
    console.log('\n  Not found / invalid:');
    for (const item of notFound) {
      console.log(`    - ${item.refId}: ${item.reason}`);
    }
  }

  if (dryRun) {
    console.log('\n  Dry run: no database or cache changes were made.');
  } else if (cache.connected) {
    console.log(`\n  Redis cache keys deleted: ${cache.keysDeleted}`);
  } else {
    console.log('\n  Redis unavailable — cache invalidation skipped.');
  }
};

async function run(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  validateCli(cli);

  await AppDataSource.initialize();

  try {
    console.log('[product-cleanup] Starting...');
    if (cli.dryRun) {
      console.log('[product-cleanup] Dry run enabled.');
    }
    if (cli.all) {
      console.log('[product-cleanup] Mode: ALL products');
    } else {
      console.log(`[product-cleanup] Mode: ${cli.refIds.length} refId(s)`);
    }
    if (cli.force) {
      console.log('[product-cleanup] Force enabled — order_items will be deleted.');
    }

    const summary = await runProductCleanup(AppDataSource, {
      refIds: cli.refIds,
      all: cli.all,
      dryRun: cli.dryRun,
      force: cli.force,
    });

    printSummary(summary.results, summary.cache, cli.dryRun);
    console.log('\n[product-cleanup] Done.');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error('[product-cleanup] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
