/**
 * Remove redundant product_media rows that make PDP galleries look doubled.
 *
 * SAFE BY DEFAULT — dry-run unless --apply.
 *
 * Rules (IMAGE + COMMON only; never touches VIDEO / SIZE_CHART):
 * 1) same_key — same GCS key appears more than once on a product:
 *    keep one row (prefer variant-scoped, then is_primary, then lower sort_order)
 * 2) product_level_with_variant_gallery — product-level row (variant_id IS NULL)
 *    while the product already has at least one variant-scoped image:
 *    remove those product-level rows (typical backfill/import double-attach)
 *
 * Rule 2 requires --drop-product-level (or is included when that flag is set with --apply).
 * Dry-run always reports both rule candidates.
 *
 * Usage:
 *   npm run product:dedupe-media
 *   npm run product:dedupe-media -- --ref-id=MEN2026665813
 *   npm run product:dedupe-media -- --drop-product-level
 *   npm run product:dedupe-media -- --drop-product-level --apply
 *   npm run product:dedupe-media -- --drop-product-level --apply --limit=50
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ProductMediaEntity } from '../../../../modules/product/entities/product-media.entity';
import { ProductMediaType } from '../../../../modules/product/enums/product-media-type.enum';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_REPORT_DIR = 'reports/product-media-dedupe';

const GALLERY_TYPES = new Set<ProductMediaType>([
  ProductMediaType.IMAGE,
  ProductMediaType.COMMON,
]);

interface CliOptions {
  apply: boolean;
  dropProductLevel: boolean;
  limit?: number;
  refId?: string;
  reportDir: string;
}

type DedupeReason = 'same_key' | 'product_level_with_variant_gallery';

type PlannedDelete = {
  mediaId: string;
  productId: string;
  productRefId: string;
  productSlug: string | null;
  variantId: string | null;
  storageKey: string;
  sortOrder: number;
  isPrimary: boolean;
  type: ProductMediaType;
  reason: DedupeReason;
};

const absolutePath = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.cwd(), p);

const storageKey = (url: ProductMediaEntity['url'] | null | undefined): string => {
  if (!url || typeof url !== 'object') return '';
  const key = typeof url.key === 'string' ? url.key.trim() : '';
  return key;
};

const printUsage = (): void => {
  console.log(`
product:dedupe-media — Remove duplicate / redundant gallery media rows

Dry-run by default. Deletes DB rows only (does not delete GCS objects).

Examples:
  npm run product:dedupe-media
  npm run product:dedupe-media -- --ref-id=MEN2026665813
  npm run product:dedupe-media -- --drop-product-level
  npm run product:dedupe-media -- --drop-product-level --apply

Options:
  --apply                 Persist deletes (default: dry-run)
  --drop-product-level    Also remove product-level IMAGE/COMMON when variant gallery exists
  --ref-id <refId>        Only one product
  --limit <n>             Max products to process
  --report-dir <path>     Default ${DEFAULT_REPORT_DIR}
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    apply: false,
    dropProductLevel: false,
    reportDir: DEFAULT_REPORT_DIR,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--drop-product-level') {
      options.dropProductLevel = true;
      continue;
    }
    if (arg === '--ref-id' || arg.startsWith('--ref-id=')) {
      options.refId = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw = arg.includes('=') ? arg.split('=')[1] : argv[++i];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) options.limit = Math.trunc(n);
      continue;
    }
    if (arg === '--report-dir' || arg.startsWith('--report-dir=')) {
      options.reportDir = arg.includes('=')
        ? arg.split('=').slice(1).join('=')
        : argv[++i] ?? options.reportDir;
    }
  }

  return options;
};

const createReportDir = (base: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(absolutePath(base), stamp);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const csvEscape = (value: unknown): string => {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const writeCsv = (filePath: string, rows: PlannedDelete[]): void => {
  const header = [
    'product_ref_id',
    'product_id',
    'media_id',
    'variant_id',
    'storage_key',
    'type',
    'sort_order',
    'is_primary',
    'reason',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.productRefId,
        row.productId,
        row.mediaId,
        row.variantId ?? '',
        row.storageKey,
        row.type,
        row.sortOrder,
        row.isPrimary,
        row.reason,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
};

/** Prefer variant-scoped, then primary, then lower sortOrder, then older createdAt. */
const rankKeep = (a: ProductMediaEntity, b: ProductMediaEntity): number => {
  const aVar = a.variantId ? 1 : 0;
  const bVar = b.variantId ? 1 : 0;
  if (aVar !== bVar) return bVar - aVar;
  if (a.isPrimary !== b.isPrimary) return Number(b.isPrimary) - Number(a.isPrimary);
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt.getTime() - b.createdAt.getTime();
};

const planDeletesForProduct = (
  product: ProductEntity,
  media: ProductMediaEntity[],
): PlannedDelete[] => {
  const gallery = media.filter((m) => GALLERY_TYPES.has(m.type));
  const planned: PlannedDelete[] = [];
  const deleteIds = new Set<string>();

  const push = (row: ProductMediaEntity, reason: DedupeReason): void => {
    if (deleteIds.has(row.id)) return;
    deleteIds.add(row.id);
    planned.push({
      mediaId: row.id,
      productId: product.id,
      productRefId: product.refId,
      productSlug: product.slug ?? null,
      variantId: row.variantId,
      storageKey: storageKey(row.url),
      sortOrder: row.sortOrder,
      isPrimary: row.isPrimary,
      type: row.type,
      reason,
    });
  };

  // Rule 1: same storage key → keep one
  const byKey = new Map<string, ProductMediaEntity[]>();
  for (const row of gallery) {
    const key = storageKey(row.url);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  for (const [, rows] of byKey) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort(rankKeep);
    const keep = sorted[0];
    for (const row of sorted.slice(1)) {
      push(row, 'same_key');
    }
    void keep;
  }

  // Rule 2: product-level while variant gallery exists
  const remaining = gallery.filter((m) => !deleteIds.has(m.id));
  const hasVariantGallery = remaining.some((m) => Boolean(m.variantId));
  if (hasVariantGallery) {
    for (const row of remaining) {
      if (row.variantId) continue;
      push(row, 'product_level_with_variant_gallery');
    }
  }

  return planned;
};

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const reportDir = createReportDir(options.reportDir);

  console.log(
    `[product:dedupe-media] apply=${options.apply} dropProductLevel=${options.dropProductLevel} limit=${options.limit ?? 'none'} refId=${options.refId ?? 'all'}`,
  );
  console.log(`[product:dedupe-media] reportDir=${reportDir}`);

  await AppDataSource.initialize();

  try {
    const productRepo = AppDataSource.getRepository(ProductEntity);
    const mediaRepo = AppDataSource.getRepository(ProductMediaEntity);

    const productQb = productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.refId', 'p.slug'])
      .where('p.deletedAt IS NULL')
      .orderBy('p.refId', 'ASC');

    if (options.refId) {
      productQb.andWhere('p.refId = :refId', { refId: options.refId.trim() });
    }

    let products = await productQb.getMany();
    if (options.limit) {
      products = products.slice(0, options.limit);
    }

    console.log(`[product:dedupe-media] productsScanned=${products.length}`);

    const allSameKey: PlannedDelete[] = [];
    const allProductLevel: PlannedDelete[] = [];
    const touchedProducts = new Map<string, { refId: string; slug?: string | null }>();

    const batchSize = 200;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const mediaRows = await mediaRepo.find({
        where: { productId: In(batch.map((p) => p.id)) },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
      const mediaByProduct = new Map<string, ProductMediaEntity[]>();
      for (const row of mediaRows) {
        const list = mediaByProduct.get(row.productId) ?? [];
        list.push(row);
        mediaByProduct.set(row.productId, list);
      }

      for (const product of batch) {
        const planned = planDeletesForProduct(product, mediaByProduct.get(product.id) ?? []);
        if (!planned.length) continue;
        touchedProducts.set(product.id, { refId: product.refId, slug: product.slug });
        for (const row of planned) {
          if (row.reason === 'same_key') allSameKey.push(row);
          else allProductLevel.push(row);
        }
      }
    }

    writeCsv(join(reportDir, 'same-key-duplicates.csv'), allSameKey);
    writeCsv(join(reportDir, 'product-level-with-variant-gallery.csv'), allProductLevel);

    const toDelete = [
      ...allSameKey,
      ...(options.dropProductLevel ? allProductLevel : []),
    ];
    const uniqueDeleteIds = [...new Set(toDelete.map((r) => r.mediaId))];

    const summary = {
      productsScanned: products.length,
      productsWithIssues: touchedProducts.size,
      sameKeyRows: allSameKey.length,
      productLevelWithVariantGalleryRows: allProductLevel.length,
      rowsQueuedForDelete: uniqueDeleteIds.length,
      dropProductLevel: options.dropProductLevel,
      apply: options.apply,
      reportDir,
    };

    console.log('[product:dedupe-media] summary:', JSON.stringify(summary, null, 2));

    if (!options.dropProductLevel && allProductLevel.length) {
      console.log(
        `[product:dedupe-media] NOTE: ${allProductLevel.length} product-level rows reported but NOT queued — re-run with --drop-product-level to include them`,
      );
    }

    if (!options.apply) {
      console.log('[product:dedupe-media] dry-run complete — re-run with --apply to delete');
      writeFileSync(join(reportDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
      return;
    }

    if (!uniqueDeleteIds.length) {
      console.log('[product:dedupe-media] nothing to delete');
      writeFileSync(join(reportDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
      return;
    }

    await mediaRepo.delete({ id: In(uniqueDeleteIds) });
    writeCsv(join(reportDir, 'deleted.csv'), toDelete);

    // Ensure each affected product still has a primary image when possible
    for (const productId of touchedProducts.keys()) {
      const remaining = await mediaRepo.find({
        where: { productId },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
      const gallery = remaining.filter((m) => GALLERY_TYPES.has(m.type));
      if (!gallery.length) continue;
      if (gallery.some((m) => m.isPrimary)) continue;
      gallery[0].isPrimary = true;
      await mediaRepo.save(gallery[0]);
    }

    const cache = await invalidateProductCache([...touchedProducts.values()], false);
    console.log(
      `[product:dedupe-media] deleted=${uniqueDeleteIds.length} cacheKeysDeleted=${cache.keysDeleted} redis=${cache.connected}`,
    );

    writeFileSync(
      join(reportDir, 'summary.json'),
      `${JSON.stringify({ ...summary, deleted: uniqueDeleteIds.length, cache }, null, 2)}\n`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[product:dedupe-media] failed:', error);
    process.exit(1);
  });
