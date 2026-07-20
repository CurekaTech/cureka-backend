/**
 * Clears Redis product/public/homepage caches so API responses are rebuilt from DB.
 *
 * Usage:
 *   npm run cache:invalidate-products
 *   npm run cache:invalidate-products -- --dry-run
 */
import * as dotenv from 'dotenv';
import { invalidateProductCache } from './product-cleanup.redis';

dotenv.config();

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const result = await invalidateProductCache([], dryRun);

  if (!result.connected) {
    console.error(
      '[cache:invalidate-products] Redis unavailable — check REDIS_HOST / REDIS_PORT / REDIS_PASSWORD in .env',
    );
    process.exit(1);
  }

  console.log(
    dryRun
      ? '[cache:invalidate-products] dry-run complete (no keys deleted)'
      : `[cache:invalidate-products] complete — ${result.keysDeleted} cache key(s) deleted`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[cache:invalidate-products] failed:', error);
    process.exit(1);
  });
