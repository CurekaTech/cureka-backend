/**
 * Align stock with out_of_stock flags.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 * Only sets stock=0 where out_of_stock=true and stock ≠ 0.
 * Does not flip INS, does not send emails.
 *
 * Usage:
 *   npm run product:stock-oos-sync
 *   npm run product:stock-oos-sync -- --apply
 *   npm run product:stock-oos-sync -- --apply --limit=100
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';

interface CliOptions {
  apply: boolean;
  limit?: number;
}

const printUsage = (): void => {
  console.log(`
product:stock-oos-sync — Set stock=0 where out_of_stock=true and stock ≠ 0

Options:
  --apply       Persist changes (default: dry-run)
  --limit <n>   Process at most N variants
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { apply: false };
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
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw = arg.includes('=') ? arg.split('=')[1] : argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`Invalid --limit: ${raw}`);
      }
      opts.limit = Math.trunc(n);
    }
  }
  return opts;
};

async function main(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  await AppDataSource.initialize();

  try {
    const qb = AppDataSource.getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .select(['variant.id', 'variant.sku', 'variant.stock', 'variant.outOfStock'])
      .where('variant.deletedAt IS NULL')
      .andWhere('variant.outOfStock = true')
      .andWhere('variant.stock <> 0')
      .orderBy('variant.sku', 'ASC');

    if (opts.limit) {
      qb.take(opts.limit);
    }

    const rows = await qb.getMany();
    console.log(`Found ${rows.length} variant(s) with outOfStock=true and stock≠0`);
    for (const row of rows.slice(0, 20)) {
      console.log(`  ${row.sku}: stock=${row.stock} → 0`);
    }
    if (rows.length > 20) {
      console.log(`  … and ${rows.length - 20} more`);
    }

    if (!opts.apply) {
      console.log('Dry-run only. Re-run with --apply to persist.');
      return;
    }

    if (!rows.length) {
      console.log('Nothing to update.');
      return;
    }

    const ids = rows.map((row) => row.id);
    await AppDataSource.getRepository(ProductVariantEntity)
      .createQueryBuilder()
      .update(ProductVariantEntity)
      .set({ stock: 0 })
      .whereInIds(ids)
      .execute();

    console.log(`Updated ${ids.length} variant(s) to stock=0.`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
