/**
 * Soft-hide (or restore) Brand `banner` via `banner_deleted_at`.
 *
 * Does NOT modify `brands.banner` JSON and does NOT touch GCS.
 *
 * Soft-delete (hide existing banners from Admin/API):
 *   npm run brand:banner-soft-delete
 *   npm run brand:banner-soft-delete -- --apply
 *
 * Rollback (un-hide banners that are still soft-deleted — safe when a new
 * banner was already uploaded, because those rows have banner_deleted_at = null):
 *   npm run brand:banner-soft-delete-rollback
 *   npm run brand:banner-soft-delete-rollback -- --apply
 *
 * Options:
 *   --apply     Persist changes (default: dry-run)
 *   --rollback  Clear banner_deleted_at instead of setting it
 *   --limit N   Cap how many rows to update
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { BrandEntity } from '../../../../modules/master/entities/brand.entity';
import { IsNull, Not } from 'typeorm';
import Redis from 'ioredis';
import { buildRedisClientOptions } from '../../../../packages/cache/src/redis-options.util';
import { CacheKeys } from '../../../../packages/cache/src/cache-keys.factory';

interface CliOptions {
  apply: boolean;
  rollback: boolean;
  limit?: number;
  help: boolean;
}

interface BrandBannerRow {
  id: string;
  refId: string;
  name: string;
  bannerKey: string | null;
  bannerDeletedAt: Date | null;
}

const printUsage = (): void => {
  console.log(`
brand:banner-soft-delete — Soft-hide brand banners (or roll back the hide)

Soft-delete keeps brands.banner JSON and GCS objects untouched; only sets
banner_deleted_at so Admin/API responses return banner: null.

  Dry-run:  npm run brand:banner-soft-delete
  Apply:    npm run brand:banner-soft-delete -- --apply

Rollback clears banner_deleted_at only where it is still set (brands that
already received a replacement banner are skipped automatically).

  Dry-run:  npm run brand:banner-soft-delete-rollback
  Apply:    npm run brand:banner-soft-delete-rollback -- --apply

Options:
  --apply       Persist changes to DB (default: dry-run)
  --rollback    Restore visibility instead of soft-hiding
  --limit <n>   Update at most N brands
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { apply: false, rollback: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--rollback') {
      options.rollback = true;
    } else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) options.limit = Math.trunc(n);
    } else if (arg === '--limit' && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) options.limit = Math.trunc(n);
      index += 1;
    }
  }

  return options;
};

const hasBannerKey = (banner: BrandEntity['banner']): banner is NonNullable<BrandEntity['banner']> =>
  Boolean(banner && typeof banner.key === 'string' && banner.key.trim().length > 0);

const scanAndDelete = async (client: Redis, pattern: string): Promise<number> => {
  let cursor = '0';
  let deleted = 0;
  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      deleted += await client.del(...keys);
    }
  } while (cursor !== '0');
  return deleted;
};

const invalidateBrandRelatedCache = async (): Promise<number> => {
  const host = process.env['REDIS_HOST'] || 'localhost';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  const password = process.env['REDIS_PASSWORD'] || undefined;
  const username = process.env['REDIS_USERNAME'] || undefined;
  const tls = process.env['REDIS_TLS'] === 'true';

  const client = new Redis(
    buildRedisClientOptions({
      host,
      port,
      password,
      username,
      tls,
      lazyConnect: true,
      enableOfflineQueue: false,
    }),
  );

  try {
    await client.connect();
  } catch {
    console.warn('[brand-banner] Redis unavailable — skipped cache invalidation');
    return 0;
  }

  try {
    const patterns = [
      CacheKeys.brands.listPattern(),
      CacheKeys.publicProducts.listPattern(),
      CacheKeys.publicListingContext.brandPattern(),
      CacheKeys.homepage.brandsWeTrustPattern(),
      CacheKeys.homepage.sectionsPattern(),
      CacheKeys.homepage.homeSectionsPattern(),
    ];
    let deleted = 0;
    for (const pattern of patterns) {
      deleted += await scanAndDelete(client, pattern);
    }
    return deleted;
  } finally {
    client.disconnect();
  }
};

const toRow = (entity: BrandEntity): BrandBannerRow => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  bannerKey: entity.banner?.key ?? null,
  bannerDeletedAt: entity.bannerDeletedAt ?? null,
});

const main = async (): Promise<void> => {
  const opts = parseCli(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }

  const mode = opts.rollback ? 'rollback' : 'soft-delete';
  console.log(`[brand-banner] mode=${mode} apply=${opts.apply} limit=${opts.limit ?? 'none'}`);

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(BrandEntity);

  try {
    let candidates: BrandEntity[];
    let skippedAlreadyProcessed = 0;
    let skippedNoBanner = 0;

    if (opts.rollback) {
      // Only rows still soft-hidden. Brands with a new upload already have
      // banner_deleted_at = null and are intentionally excluded.
      candidates = await repo.find({
        where: { bannerDeletedAt: Not(IsNull()) },
        order: { createdAt: 'ASC' },
      });
    } else {
      const withBanner = await repo
        .createQueryBuilder('brand')
        .where('brand.deletedAt IS NULL')
        .andWhere('brand.banner IS NOT NULL')
        .andWhere("COALESCE(brand.banner->>'key', '') <> ''")
        .orderBy('brand.createdAt', 'ASC')
        .getMany();

      candidates = [];
      for (const brand of withBanner) {
        if (!hasBannerKey(brand.banner)) {
          skippedNoBanner += 1;
          continue;
        }
        if (brand.bannerDeletedAt) {
          skippedAlreadyProcessed += 1;
          continue;
        }
        candidates.push(brand);
      }
    }

    const limited = opts.limit ? candidates.slice(0, opts.limit) : candidates;
    console.log(
      `[brand-banner] eligible=${limited.length}` +
        (opts.rollback
          ? ''
          : ` skippedAlreadySoftDeleted=${skippedAlreadyProcessed} skippedInvalidBanner=${skippedNoBanner}`),
    );

    if (!limited.length) {
      console.log('[brand-banner] nothing to update');
      return;
    }

    console.log(
      '[brand-banner] sample:',
      JSON.stringify(limited.slice(0, 20).map(toRow), null, 2),
    );

    if (!opts.apply) {
      console.log('[brand-banner] dry-run complete — re-run with --apply to persist');
      return;
    }

    const now = new Date();
    const chunkSize = 200;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < limited.length; i += chunkSize) {
      const batch = limited.slice(i, i + chunkSize);
      const ids = batch.map((b) => b.id);

      try {
        const result = opts.rollback
          ? await repo
              .createQueryBuilder()
              .update(BrandEntity)
              .set({ bannerDeletedAt: null })
              .where('id IN (:...ids)', { ids })
              .andWhere('banner_deleted_at IS NOT NULL')
              .execute()
          : await repo
              .createQueryBuilder()
              .update(BrandEntity)
              // Only touch banner_deleted_at. Never clear/overwrite banner JSON.
              .set({ bannerDeletedAt: now })
              .where('id IN (:...ids)', { ids })
              .andWhere('banner_deleted_at IS NULL')
              .execute();
        updated += result.affected ?? 0;
      } catch (error) {
        failed += batch.length;
        console.error(
          `[brand-banner] batch failed at offset=${i} size=${batch.length}`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    const cacheKeysDeleted = await invalidateBrandRelatedCache();
    console.log(
      `[brand-banner] done updated=${updated} failed=${failed} cacheKeysDeleted=${cacheKeysDeleted}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
};

main().catch((error) => {
  console.error('[brand-banner] fatal:', error);
  process.exitCode = 1;
});
