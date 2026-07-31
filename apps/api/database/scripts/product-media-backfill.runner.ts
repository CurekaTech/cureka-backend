/**
 * Backfill / repair product media from the WooCommerce export sheet.
 *
 * Matches sheet `ID` → product/variant `external_product_id`, downloads
 * missing Images URLs into storage, and binds them as common product media.
 *
 * SAFE BY DEFAULT:
 *   - Does NOT delete or replace existing product images
 *   - Only APPENDS missing files (e.g. .bmp that failed earlier)
 *   - Dry-run unless --apply
 *
 * Destructive replace is opt-in only: --replace --confirm --apply
 *
 * Usage:
 *   npm run product:backfill-media
 *   npm run product:backfill-media -- --only-bmp --apply
 *   npm run product:backfill-media -- --only-missing --apply
 *   npm run product:backfill-media -- --only-bmp --replace --confirm --apply
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { In, DataSource } from 'typeorm';
import { Readable } from 'stream';
import { isAbsolute, resolve } from 'path';
import { AppModule } from '../../app.module';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import {
  loadImageUrlsByProductId,
  normalizeLookupProductId,
} from '@modules/product/utils/bulk-upload-reference-lookup.util';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/wc-product-export-6-7-2026-1783309274325.xlsx';
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;

type Mode = 'only-bmp' | 'only-missing' | 'all-matched';

interface CliOptions {
  file: string;
  mode: Mode;
  apply: boolean;
  confirm: boolean;
  /** When true, delete existing common media and rewrite from sheet. Requires --confirm. */
  replace: boolean;
  limit?: number;
  concurrency: number;
}

interface Target {
  productId: string;
  refId: string;
  externalId: string;
  /** Full sheet gallery (used only with --replace). */
  urls: string[];
  /** URLs that will actually be downloaded in append mode. */
  urlsToAdd: string[];
  existingCommonCount: number;
}

const resolveMime = (filename: string, contentType: string | null): string => {
  const fromHeader = contentType?.split(';')[0]?.trim().toLowerCase();
  if (fromHeader && fromHeader !== 'application/octet-stream' && fromHeader !== 'binary/octet-stream') {
    return fromHeader;
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.jpeg') || lower.endsWith('.jpg')) return 'image/jpeg';
  return 'image/jpeg';
};

const urlHasBmp = (urls: string[]): boolean =>
  urls.some((url) => /\.bmp(\?|#|$)/i.test(url.trim()));

const basenameFromUrl = (url: string): string => {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const name = clean.split('/').pop() ?? '';
    return decodeURIComponent(name).trim().toLowerCase();
  } catch {
    return '';
  }
};

const basenameFromStorageKey = (key: string | null | undefined): string => {
  if (!key) return '';
  const name = key.split('/').pop() ?? '';
  return name.trim().toLowerCase();
};

const absolutePath = (path: string): string =>
  isAbsolute(path) ? path : resolve(process.cwd(), path);

const printUsage = (): void => {
  console.log(`
Product media backfill (WC sheet Images → external_product_id)

SAFE DEFAULT: appends missing images only — never deletes current media.

Examples:
  npm run product:backfill-media
  npm run product:backfill-media -- --only-bmp --apply
  npm run product:backfill-media -- --only-missing --apply
  npm run product:backfill-media -- --only-bmp --replace --confirm --apply

Options:
  --file <path>        WC export xlsx
  --only-bmp           Sheet has .bmp; append only missing .bmp files (default)
  --only-missing       Product has no common media; fill full gallery from sheet
  --all-matched        All matched products (append missing sheet files)
  --replace            DELETE existing common media then rewrite from sheet (destructive)
  --apply              Persist downloads + DB rows
  --confirm            Required with --replace --apply
  --limit <n>          Max products
  --concurrency <n>    Parallel downloads (default ${DEFAULT_CONCURRENCY})
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_FILE,
    mode: 'only-bmp',
    apply: false,
    confirm: false,
    replace: false,
    concurrency: DEFAULT_CONCURRENCY,
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
    if (arg === '--confirm') {
      options.confirm = true;
      continue;
    }
    if (arg === '--replace') {
      options.replace = true;
      continue;
    }
    if (arg === '--only-bmp') {
      options.mode = 'only-bmp';
      continue;
    }
    if (arg === '--only-missing') {
      options.mode = 'only-missing';
      continue;
    }
    if (arg === '--all-matched') {
      options.mode = 'all-matched';
      continue;
    }
    if (arg === '--file' || arg.startsWith('--file=')) {
      options.file = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? options.file;
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw = arg.includes('=') ? arg.split('=')[1] : argv[++i];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) options.limit = Math.trunc(n);
      continue;
    }
    if (arg === '--concurrency' || arg.startsWith('--concurrency=')) {
      const raw = arg.includes('=') ? arg.split('=')[1] : argv[++i];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) options.concurrency = Math.trunc(n);
      continue;
    }
  }

  return options;
};

const mapPool = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;

  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  };

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const downloadOne = async (
  storage: StorageService,
  url: string,
  index: number,
): Promise<{ path: string; sortOrder: number; basename: string }> => {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CurekaMediaBackfill/1.0; +https://www.cureka.com)',
      Accept: 'image/*,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const originalFilename = basenameFromUrl(url) || `image-${index + 1}.jpg`;
  const mimetype = resolveMime(originalFilename, response.headers.get('content-type'));
  const upload = await storage.uploadImage({
    stream: Readable.from(buffer),
    mimetype,
    originalFilename,
    folder: UploadFolder.IMAGES,
    maxSizeOverride: DEFAULT_MAX_IMAGE_BYTES,
  });
  return {
    path: upload.path,
    sortOrder: index,
    basename: originalFilename.toLowerCase(),
  };
};

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));

  if (options.replace && options.apply && !options.confirm) {
    throw new Error('--replace --apply requires --confirm (this deletes existing common media)');
  }

  const filePath = absolutePath(options.file);
  console.log(`[product:backfill-media] file=${filePath}`);
  console.log(
    `[product:backfill-media] mode=${options.mode} replace=${options.replace} apply=${options.apply} concurrency=${options.concurrency}${options.limit ? ` limit=${options.limit}` : ''}`,
  );
  console.log(
    options.replace
      ? '[product:backfill-media] WARNING: --replace will DELETE existing common/product-level images for targeted products'
      : '[product:backfill-media] safe mode: existing images are kept; only missing files are appended',
  );

  const imageLookup = await loadImageUrlsByProductId(filePath);
  if (!imageLookup.loaded || imageLookup.byProductId.size === 0) {
    throw new Error(`Could not load Images from sheet: ${filePath}`);
  }
  console.log(`[product:backfill-media] sheet product IDs with images=${imageLookup.byProductId.size}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const storage = app.get(StorageService);
    const productRepo = dataSource.getRepository(ProductEntity);
    const variantRepo = dataSource.getRepository(ProductVariantEntity);
    const mediaRepo = dataSource.getRepository(ProductMediaEntity);

    const productsByExternalId = new Map<string, ProductEntity>();

    const productsWithExternal = await productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.refId', 'p.externalProductId', 'p.name'])
      .where('p.externalProductId IS NOT NULL')
      .andWhere("TRIM(p.externalProductId) <> ''")
      .getMany();
    for (const product of productsWithExternal) {
      const key = normalizeLookupProductId(product.externalProductId);
      if (key && imageLookup.byProductId.has(key)) {
        productsByExternalId.set(key, product);
      }
    }

    const variantsWithExternal = await variantRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.productId', 'v.externalProductId'])
      .where('v.externalProductId IS NOT NULL')
      .andWhere("TRIM(v.externalProductId) <> ''")
      .getMany();

    const neededParentIds = [
      ...new Set(
        variantsWithExternal
          .filter((v) => {
            const key = normalizeLookupProductId(v.externalProductId);
            return Boolean(key && imageLookup.byProductId.has(key) && !productsByExternalId.has(key));
          })
          .map((v) => v.productId),
      ),
    ];

    const parents: ProductEntity[] = [];
    for (const idChunk of chunk(neededParentIds, 500)) {
      const rows = await productRepo.find({
        where: { id: In(idChunk) },
        select: ['id', 'refId', 'externalProductId', 'name'],
      });
      parents.push(...rows);
    }
    const parentById = new Map(parents.map((p) => [p.id, p]));
    for (const variant of variantsWithExternal) {
      const key = normalizeLookupProductId(variant.externalProductId);
      if (!key || !imageLookup.byProductId.has(key) || productsByExternalId.has(key)) continue;
      const parent = parentById.get(variant.productId);
      if (parent) productsByExternalId.set(key, parent);
    }

    console.log(
      `[product:backfill-media] DB matches by external_product_id=${productsByExternalId.size}`,
    );

    const matchedProductIds = [
      ...new Set([...productsByExternalId.values()].map((p) => p.id)),
    ];

    const existingMediaByProduct = new Map<string, ProductMediaEntity[]>();
    for (const idChunk of chunk(matchedProductIds, 500)) {
      const commonRows = await mediaRepo
        .createQueryBuilder('m')
        .where('m.product_id IN (:...ids)', { ids: idChunk })
        .andWhere('m.variant_id IS NULL')
        .andWhere('m.type IN (:...types)', {
          types: [ProductMediaType.COMMON, ProductMediaType.IMAGE],
        })
        .getMany();
      for (const row of commonRows) {
        const list = existingMediaByProduct.get(row.productId) ?? [];
        list.push(row);
        existingMediaByProduct.set(row.productId, list);
      }
    }

    const targets: Target[] = [];
    let unmatchedSheet = 0;
    let skippedFilter = 0;
    let skippedAlreadyPresent = 0;

    for (const [externalId, urls] of imageLookup.byProductId) {
      const product = productsByExternalId.get(externalId);
      if (!product) {
        unmatchedSheet += 1;
        continue;
      }

      const existing = existingMediaByProduct.get(product.id) ?? [];
      const existingCommonCount = existing.length;
      const existingBasenames = new Set(
        existing
          .map((m) => basenameFromStorageKey(m.url?.key))
          .filter(Boolean),
      );

      if (options.mode === 'only-bmp' && !urlHasBmp(urls)) {
        skippedFilter += 1;
        continue;
      }
      if (options.mode === 'only-missing' && existingCommonCount > 0) {
        skippedFilter += 1;
        continue;
      }

      let urlsToAdd: string[];
      if (options.replace) {
        urlsToAdd = urls;
      } else if (options.mode === 'only-bmp') {
        // Append only BMP files that are not already stored (by filename).
        urlsToAdd = urls.filter((url) => {
          if (!/\.bmp(\?|#|$)/i.test(url)) return false;
          const base = basenameFromUrl(url);
          return Boolean(base) && !existingBasenames.has(base);
        });
      } else if (options.mode === 'only-missing') {
        urlsToAdd = urls;
      } else {
        // all-matched append: any sheet file whose basename is not already present
        urlsToAdd = urls.filter((url) => {
          const base = basenameFromUrl(url);
          return Boolean(base) && !existingBasenames.has(base);
        });
      }

      if (!urlsToAdd.length) {
        skippedAlreadyPresent += 1;
        continue;
      }

      const existingTarget = targets.find((t) => t.productId === product.id);
      if (existingTarget) {
        if (urlHasBmp(urls) && !urlHasBmp(existingTarget.urls)) {
          existingTarget.externalId = externalId;
          existingTarget.urls = urls;
          existingTarget.urlsToAdd = urlsToAdd;
        } else {
          // Merge any additional missing URLs
          const seen = new Set(existingTarget.urlsToAdd.map(basenameFromUrl));
          for (const url of urlsToAdd) {
            const base = basenameFromUrl(url);
            if (base && !seen.has(base)) {
              existingTarget.urlsToAdd.push(url);
              seen.add(base);
            }
          }
        }
        continue;
      }

      targets.push({
        productId: product.id,
        refId: product.refId,
        externalId,
        urls,
        urlsToAdd,
        existingCommonCount,
      });
    }

    const limited = options.limit ? targets.slice(0, options.limit) : targets;
    console.log(
      `[product:backfill-media] targets=${limited.length} (unmatchedSheet=${unmatchedSheet}, skippedFilter=${skippedFilter}, skippedAlreadyPresent=${skippedAlreadyPresent})`,
    );

    if (!limited.length) {
      console.log('[product:backfill-media] nothing to do — existing images left untouched');
      return;
    }

    if (!options.apply) {
      const sample = limited.slice(0, 15).map((t) => ({
        refId: t.refId,
        externalId: t.externalId,
        existingCommonCount: t.existingCommonCount,
        willAdd: t.urlsToAdd.length,
        willDeleteExisting: options.replace,
        addSample: t.urlsToAdd.slice(0, 3),
      }));
      console.log('[product:backfill-media] dry-run sample:', JSON.stringify(sample, null, 2));
      console.log(
        '[product:backfill-media] dry-run complete — existing images are NOT modified; re-run with --apply to append missing files',
      );
      return;
    }

    let ok = 0;
    let failed = 0;
    let addedTotal = 0;
    const failures: Array<{ refId: string; externalId: string; error: string }> = [];
    const touchedRefIds: string[] = [];

    for (const target of limited) {
      try {
        const existing = existingMediaByProduct.get(target.productId) ?? [];
        const maxSort = existing.reduce((max, m) => Math.max(max, m.sortOrder ?? 0), -1);

        const downloaded = await mapPool(
          target.urlsToAdd,
          options.concurrency,
          async (url, index) => downloadOne(storage, url, index),
        );

        await dataSource.transaction(async (manager) => {
          const repo = manager.getRepository(ProductMediaEntity);

          if (options.replace) {
            await repo
              .createQueryBuilder()
              .delete()
              .from(ProductMediaEntity)
              .where('product_id = :productId', { productId: target.productId })
              .andWhere('variant_id IS NULL')
              .andWhere('type IN (:...types)', {
                types: [ProductMediaType.COMMON, ProductMediaType.IMAGE],
              })
              .execute();

            await repo.save(
              downloaded.map((item, index) =>
                repo.create({
                  productId: target.productId,
                  variantId: null,
                  type: ProductMediaType.COMMON,
                  url: storage.persistFileReference(item.path)!,
                  sortOrder: index,
                  isPrimary: index === 0,
                }),
              ),
            );
          } else {
            // APPEND only — keep every existing row and primary flag as-is.
            await repo.save(
              downloaded.map((item, index) =>
                repo.create({
                  productId: target.productId,
                  variantId: null,
                  type: ProductMediaType.COMMON,
                  url: storage.persistFileReference(item.path)!,
                  sortOrder: maxSort + 1 + index,
                  isPrimary: false,
                }),
              ),
            );
          }
        });

        ok += 1;
        addedTotal += downloaded.length;
        touchedRefIds.push(target.refId);
        console.log(
          `[product:backfill-media] OK ${target.refId} externalId=${target.externalId} ${options.replace ? 'replaced' : 'appended'}=${downloaded.length} keptExisting=${options.replace ? 0 : target.existingCommonCount}`,
        );
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ refId: target.refId, externalId: target.externalId, error: message });
        console.error(
          `[product:backfill-media] FAIL ${target.refId} externalId=${target.externalId}: ${message}`,
        );
      }
    }

    const cache = await invalidateProductCache(
      touchedRefIds.map((refId) => ({ refId })),
      false,
    );
    console.log(
      `[product:backfill-media] done ok=${ok} failed=${failed} imagesAdded=${addedTotal} cacheKeysDeleted=${cache.keysDeleted} redis=${cache.connected}`,
    );
    if (failures.length) {
      console.log('[product:backfill-media] failures:', JSON.stringify(failures.slice(0, 30), null, 2));
    }
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[product:backfill-media] failed:', error);
    process.exit(1);
  });
