/**
 * Reconcile the updated legacy image sheet with the harvest cache and GCS map.
 *
 * Dry-run unless --apply. Does not call legacy.cureka.com for a URL whose GCS
 * object already exists and validates as an image.
 *
 * Usage:
 *   npm run product:reconcile-legacy-images
 *   npm run product:reconcile-legacy-images -- --apply
 *   npm run product:reconcile-legacy-images -- --limit=20 --apply
 *
 * TechBV / current-environment test (only unambiguous DB matches):
 *   npm run product:reconcile-legacy-images:test
 *   npm run product:reconcile-legacy-images:test -- --apply
 */
import 'reflect-metadata';
import { copyFile, access, mkdir } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import { Readable } from 'stream';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { In, type DataSource, type Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { AppModule } from '../../app.module';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import {
  toLegacyCurekaImageUrl,
} from '@modules/product/utils/bulk-upload-image.util';
import {
  DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
  DEFAULT_IMAGE_HARVEST_CACHE_FILE,
  loadHarvestedImageLookup,
} from '@modules/product/utils/bulk-upload-reference-lookup.util';
import {
  classifyLegacyMatches,
  decideCachedImageReuse,
  findHarvestedGcsKey,
  forgetHarvestCacheKey,
  indexIdentities,
  loadIdSkuImageSheet,
  matchMissingToLegacy,
  mergeHarvestedImageRows,
  rememberHarvestCacheKey,
  validateBackedUpImageBuffer,
  type ClassifiedLegacyMatch,
  type IdSkuImageRow,
  type VariantMatchCandidate,
} from '@modules/product/utils/legacy-image-reconcile.util';
import {
  loadHarvestCache,
  saveHarvestCache,
  writeHarvestedImageRows,
} from '@modules/product/utils/wp-image-harvest.util';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_LEGACY_FILE = 'docs/Master-Data-Sheets/legacy-image-urls-10-09.xlsx';
const DEFAULT_MISSING_FILE = 'docs/Master-Data-Sheets/missing-images.xlsx';
const DEFAULT_REPORT_FILE = 'docs/Master-Data-Sheets/legacy-image-reconcile-report.xlsx';
const TECHBV_REPORT_FILE = 'docs/Master-Data-Sheets/legacy-image-reconcile-techbv-report.xlsx';
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const CACHE_FLUSH_EVERY = 25;
const DB_CHUNK = 400;
const MERGE_KINDS = new Set(['sku_and_product_id', 'sku_only', 'product_id_only', 'not_in_db']);

interface CliOptions {
  file: string;
  missing: string;
  cache: string;
  out: string;
  report: string;
  apply: boolean;
  allowEmptyCache: boolean;
  matchedOnly: boolean;
  limit?: number;
  concurrency: number;
}

interface UrlOutcome {
  key?: string;
  error?: string;
  downloaded: boolean;
}

const absolutePath = (filePath: string): string =>
  isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
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
      results[index] = await worker(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => run()));
  return results;
};

const basenameFromUrl = (url: string): string => {
  try {
    const clean = url.split('?')[0]?.split('#')[0] ?? url;
    return decodeURIComponent(clean.split('/').pop() ?? '').trim();
  } catch {
    return '';
  }
};

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'Timeout';
    return error.message;
  }
  return String(error);
};

const printUsage = (): void => {
  console.log(`
Reconcile legacy image URLs into the harvest cache, GCS map, and missing variants.

Examples:
  npm run product:reconcile-legacy-images
  npm run product:reconcile-legacy-images -- --apply
  npm run product:reconcile-legacy-images -- --limit=20 --apply
  npm run product:reconcile-legacy-images:test
  npm run product:reconcile-legacy-images:test -- --apply

Options:
  --file <path>         Legacy image workbook (ID, SKU, Images)
  --missing <path>      Missing-images workbook (Product Id, SKU)
  --cache <path>        Harvest cache JSON (URL → GCS key)
  --out <path>          Harvested GCS map workbook
  --report <path>       Reconciliation report workbook
  --apply               Validate, download, write cache/map, update DB and cache
  --dry-run             Preview only. This is the default, and it overrides --apply
  --allow-empty-cache   Allow --apply when the cache file is missing
  --matched-only        Only download and update variants that match the current DB
  --limit <n>           Max new URLs to download
  --concurrency <n>     Parallel downloads (default ${DEFAULT_CONCURRENCY})
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const matchedOnly = argv.includes('--matched-only');
  const options: CliOptions = {
    file: DEFAULT_LEGACY_FILE,
    missing: DEFAULT_MISSING_FILE,
    cache: DEFAULT_IMAGE_HARVEST_CACHE_FILE,
    out: DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
    report: matchedOnly ? TECHBV_REPORT_FILE : DEFAULT_REPORT_FILE,
    apply: false,
    allowEmptyCache: false,
    matchedOnly,
    concurrency: DEFAULT_CONCURRENCY,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const valueOf = (): string => (arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++index] ?? '');
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--matched-only') options.matchedOnly = true;
    else if (arg === '--allow-empty-cache') options.allowEmptyCache = true;
    else if (arg === '--file' || arg.startsWith('--file=')) options.file = valueOf();
    else if (arg === '--missing' || arg.startsWith('--missing=')) options.missing = valueOf();
    else if (arg === '--cache' || arg.startsWith('--cache=')) options.cache = valueOf();
    else if (arg === '--out' || arg.startsWith('--out=')) options.out = valueOf();
    else if (arg === '--report' || arg.startsWith('--report=')) options.report = valueOf();
    else if (arg === '--limit' || arg.startsWith('--limit=')) {
      const limit = Number(valueOf());
      if (Number.isFinite(limit) && limit > 0) options.limit = Math.trunc(limit);
    } else if (arg === '--concurrency' || arg.startsWith('--concurrency=')) {
      const concurrency = Number(valueOf());
      if (Number.isFinite(concurrency) && concurrency > 0) options.concurrency = Math.trunc(concurrency);
    }
  }
  if (argv.includes('--dry-run')) options.apply = false;
  return options;
};

const mediaKey = (media: ProductMediaEntity): string => {
  const url = media.url as { key?: string } | null;
  return typeof url?.key === 'string' ? url.key : '';
};

const addSheet = (
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width: number }>,
  rows: Array<Record<string, string | number | boolean>>,
): void => {
  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = columns;
  for (const row of rows) worksheet.addRow(row);
};

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const legacyPath = absolutePath(options.file);
  const missingPath = absolutePath(options.missing);
  const cachePath = absolutePath(options.cache);
  const outPath = absolutePath(options.out);
  const reportPath = absolutePath(options.report);

  const logName = options.matchedOnly
    ? 'product:reconcile-legacy-images:test'
    : 'product:reconcile-legacy-images';
  console.log(`[${logName}] file=${legacyPath}`);
  console.log(`[${logName}] missing=${missingPath}`);
  console.log(`[${logName}] cache=${cachePath}`);
  console.log(`[${logName}] out=${outPath}`);
  console.log(`[${logName}] apply=${options.apply} matchedOnly=${options.matchedOnly}`);

  const legacyRows = await loadIdSkuImageSheet(legacyPath, { requireImages: true });
  const missingRows = await loadIdSkuImageSheet(missingPath);
  const cacheExists = await fileExists(cachePath);
  const cache = cacheExists ? await loadHarvestCache(cachePath) : new Map<string, string>();
  const existingLookup = await loadHarvestedImageLookup(outPath);

  console.log(
    `[${logName}] legacyRows=${legacyRows.length} missingRows=${missingRows.length} cacheUrls=${cache.size} mapRows=${existingLookup.rows.length}`,
  );

  if (!options.apply && !options.matchedOnly) {
    const pending = uniqueSheetUrls(legacyRows).filter((url) => !findHarvestedGcsKey(cache, url));
    console.log(
      `[${logName}] dry-run cacheHits=${uniqueSheetUrls(legacyRows).length - pending.length} pendingDownloads=${pending.length}`,
    );
    console.log(`[${logName}] dry-run complete — re-run with --apply to validate GCS, download, and update DB`);
    console.log(`[${logName}] sample pending:`, JSON.stringify(pending.slice(0, 10), null, 2));
    return;
  }

  if (options.apply && !cacheExists && !options.allowEmptyCache && !options.matchedOnly) {
    throw new Error(
      `Harvest cache is missing (${cachePath}). Refusing to rebuild the map from an empty cache. Pass --allow-empty-cache only for a first run.`,
    );
  }

  if (options.apply) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (cacheExists) await copyFile(cachePath, `${cachePath}.bak-${stamp}`);
    if (await fileExists(outPath)) await copyFile(outPath, `${outPath}.bak-${stamp}`);
    console.log(`[${logName}] backups written with stamp ${stamp}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    console.log(`[${logName}] database=${describeDatabaseTarget(dataSource)}`);
    const storage = app.get(StorageService);
    const variantRepo = dataSource.getRepository(ProductVariantEntity);
    const productRepo = dataSource.getRepository(ProductEntity);
    const variants = await loadVariantCandidates(variantRepo, productRepo);
    const legacyMatches = classifyLegacyMatches(legacyRows, variants);
    const missingMatches = classifyLegacyMatches(missingRows, variants);
    const matchedRows = legacyRows.filter((_, index) => legacyMatches[index]?.updateAllowed);
    console.log(
      `[${logName}] dbVariants=${variants.length} matched=${matchedRows.length} unmatched=${countKind(legacyMatches, 'not_in_db')} conflicts=${countConflicts(legacyMatches)}`,
    );

    if (!options.apply) {
      await writeTechbvReport({
        reportPath,
        legacyRows,
        legacyMatches,
        outcomes: { byUrl: new Map() },
        updatedVariantIds: new Set(),
        cacheUpdated: false,
        dryRun: true,
      });
      printTechbvSummary(buildTechbvSummary(legacyRows, legacyMatches, new Map(), 0, 0));
      console.log(`[${logName}] dry-run complete — re-run with --apply to download and update this database`);
      return;
    }

    const rowsToResolve = options.matchedOnly ? matchedRows : legacyRows;
    const outcomes = await resolveUrls(rowsToResolve, cache, cachePath, storage, options);
    const mergeKinds = options.matchedOnly
      ? new Set(['sku_and_product_id', 'sku_only', 'product_id_only'])
      : MERGE_KINDS;
    const incomingRows = legacyRows.flatMap((row, index) => {
      const match = legacyMatches[index];
      if (!match || !mergeKinds.has(match.kind)) return [];
      const keys = keysForRow(row, outcomes.byUrl);
      if (!keys.length) return [];
      return [{ productId: row.productId, sku: row.sku, keys }];
    });
    const mergedRows = mergeHarvestedImageRows(existingLookup.rows, incomingRows, outcomes.invalidated);
    await saveHarvestCache(cachePath, cache);
    await writeHarvestedImageRows(outPath, mergedRows);

    const eligibleVariantIds = options.matchedOnly
      ? new Set(
          legacyMatches
            .filter((match) => match.updateAllowed && match.variant)
            .map((match) => match.variant!.id),
        )
      : new Set(
          missingMatches
            .filter((match) => match.updateAllowed && match.variant)
            .map((match) => match.variant!.id),
        );

    const dbResult = await updateMissingVariants(
      dataSource,
      storage,
      legacyRows,
      legacyMatches,
      eligibleVariantIds,
      outcomes.byUrl,
    );
    const cacheResult = await invalidateProductCache(dbResult.cacheTargets, false);
    const validation = await validateUpdatedVariants(
      dataSource,
      storage,
      cache,
      dbResult.updated,
    );

    if (options.matchedOnly) {
      const updatedVariantIds = new Set(dbResult.updated.map((item) => item.match.variant!.id));
      await writeTechbvReport({
        reportPath,
        legacyRows,
        legacyMatches,
        outcomes,
        updatedVariantIds,
        cacheUpdated: cacheResult.connected,
        cacheUpdateCount: cacheResult.connected ? dbResult.cacheTargets.length : 0,
        dryRun: false,
      });
      printTechbvSummary(
        buildTechbvSummary(
          legacyRows,
          legacyMatches,
          outcomes.byUrl,
          dbResult.updated.length,
          cacheResult.connected ? dbResult.cacheTargets.length : 0,
        ),
      );
    } else {
      await writeReport({
        reportPath,
        legacyRows,
        legacyMatches,
        missingRows,
        outcomes,
        dbResult,
        cacheUpdated: cacheResult.connected,
      });
    }

    console.log(
      `[${logName}] done updated=${dbResult.updated.length} notInDb=${countKind(legacyMatches, 'not_in_db')} failures=${outcomes.failures.length} cacheKeysDeleted=${cacheResult.keysDeleted} redis=${cacheResult.connected} validationFailures=${validation.failures}`,
    );
    if (validation.failures > 0) {
      throw new Error(`Validation failed for ${validation.failures} updated variant(s)`);
    }
  } finally {
    await app.close();
  }
}

const uniqueSheetUrls = (rows: IdSkuImageRow[]): string[] => {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const row of rows) {
    for (const url of row.imageUrls) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
};

const keysForRow = (row: IdSkuImageRow, byUrl: Map<string, UrlOutcome>): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const url of row.imageUrls) {
    const key = byUrl.get(url)?.key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
};

const countKind = (matches: ClassifiedLegacyMatch[], kind: string): number =>
  matches.filter((match) => match.kind === kind).length;

const loadVariantCandidates = async (
  variantRepo: Repository<ProductVariantEntity>,
  productRepo: Repository<ProductEntity>,
): Promise<VariantMatchCandidate[]> => {
  const variants = await variantRepo.find({
    select: ['id', 'sku', 'externalProductId', 'productId'],
  });
  const productIds = [...new Set(variants.map((variant) => variant.productId))];
  const products = new Map<string, ProductEntity>();
  for (const ids of chunk(productIds, DB_CHUNK)) {
    const rows = await productRepo.find({
      where: { id: In(ids) },
      select: ['id', 'refId', 'slug', 'externalProductId'],
    });
    for (const product of rows) products.set(product.id, product);
  }

  return variants.map((variant) => {
    const product = products.get(variant.productId);
    return {
      id: variant.id,
      sku: variant.sku,
      externalProductId: variant.externalProductId,
      productExternalProductId: product?.externalProductId ?? null,
      productId: variant.productId,
      productRefId: product?.refId ?? '',
      productSlug: product?.slug ?? null,
    };
  });
};

const resolveUrls = async (
  rows: IdSkuImageRow[],
  cache: Map<string, string>,
  cachePath: string,
  storage: StorageService,
  options: CliOptions,
): Promise<{ byUrl: Map<string, UrlOutcome>; invalidated: Set<string>; failures: Array<{ url: string; error: string }> }> => {
  const byUrl = new Map<string, UrlOutcome>();
  const invalidated = new Set<string>();
  const failures: Array<{ url: string; error: string }> = [];
  const validatedKeys = new Map<string, boolean>();
  const urls = uniqueSheetUrls(rows);
  let downloaded = 0;
  let sinceFlush = 0;
  let flushing = Promise.resolve();

  const flush = async (): Promise<void> => {
    const pending = flushing.then(() => saveHarvestCache(cachePath, cache));
    flushing = pending.then(
      () => undefined,
      () => undefined,
    );
    await pending;
  };

  const inspectKey = async (key: string): Promise<{ exists: boolean; valid: boolean }> => {
    const cached = validatedKeys.get(key);
    if (cached !== undefined) return { exists: true, valid: cached };
    let exists = false;
    let valid = false;
    try {
      exists = await storage.exists(key);
      if (exists) {
        const buffer = await storage.readObjectBuffer(key, DEFAULT_MAX_IMAGE_BYTES);
        valid = validateBackedUpImageBuffer(buffer, DEFAULT_MAX_IMAGE_BYTES).ok;
      }
    } catch {
      exists = false;
      valid = false;
    }
    if (exists) validatedKeys.set(key, valid);
    return { exists, valid };
  };

  const pending: string[] = [];
  const retryReason = new Map<string, string>();
  for (const url of urls) {
    const cachedKey = findHarvestedGcsKey(cache, url);
    const inspected = cachedKey ? await inspectKey(cachedKey) : { exists: false, valid: false };
    const decision = decideCachedImageReuse({
      cachedKey,
      objectExists: inspected.exists,
      validationOk: inspected.valid,
    });
    if (decision.action === 'reuse') {
      byUrl.set(url, { key: decision.key, downloaded: false });
      continue;
    }
    if (cachedKey) {
      invalidated.add(cachedKey);
      forgetHarvestCacheKey(cache, cachedKey);
      retryReason.set(url, decision.reason);
    }
    pending.push(url);
  }

  const toDownload = options.limit ? pending.slice(0, options.limit) : pending;
  console.log(
    `[product:reconcile-legacy-images] urls=${urls.length} reused=${byUrl.size} retryOrMissing=${pending.length} thisRun=${toDownload.length}`,
  );

  await mapPool(toDownload, options.concurrency, async (url) => {
    try {
      const downloadUrl = toLegacyCurekaImageUrl(url);
      const response = await fetch(downloadUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CurekaImageHarvest/1.0; +https://www.cureka.com)',
          Accept: 'image/*,*/*;q=0.8',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const validation = validateBackedUpImageBuffer(buffer, DEFAULT_MAX_IMAGE_BYTES);
      if (!validation.ok) throw new Error(validation.error ?? 'Invalid image response');
      const originalFilename = basenameFromUrl(downloadUrl) || 'image.jpg';
      const upload = await storage.uploadImage({
        stream: Readable.from(buffer),
        mimetype: validation.mime ?? 'image/jpeg',
        originalFilename,
        folder: UploadFolder.IMAGES,
        maxSizeOverride: DEFAULT_MAX_IMAGE_BYTES,
      });
      rememberHarvestCacheKey(cache, url, upload.path);
      validatedKeys.set(upload.path, true);
      byUrl.set(url, { key: upload.path, downloaded: true });
      downloaded += 1;
      sinceFlush += 1;
      if (sinceFlush >= CACHE_FLUSH_EVERY) {
        sinceFlush = 0;
        await flush();
      }
      console.log(`[product:reconcile-legacy-images] OK ${downloaded}/${toDownload.length} ${upload.path}`);
    } catch (error) {
      const message = describeError(error);
      const prefix = retryReason.get(url);
      const reason = prefix ? `${prefix}; ${message}` : message;
      byUrl.set(url, { error: reason, downloaded: false });
      failures.push({ url, error: reason });
      console.error(`[product:reconcile-legacy-images] FAIL ${url}: ${reason}`);
    }
  });

  await flush();
  for (const url of pending.slice(toDownload.length)) {
    if (!byUrl.has(url)) byUrl.set(url, { error: 'Deferred by --limit', downloaded: false });
  }
  return { byUrl, invalidated, failures };
};

const updateMissingVariants = async (
  dataSource: DataSource,
  storage: StorageService,
  legacyRows: IdSkuImageRow[],
  matches: ClassifiedLegacyMatch[],
  eligibleVariantIds: Set<string>,
  byUrl: Map<string, UrlOutcome>,
): Promise<{
  updated: Array<{
    row: IdSkuImageRow;
    match: ClassifiedLegacyMatch;
    keys: string[];
    downloaded: number;
    primary: string;
  }>;
  cacheTargets: Array<{ refId: string; slug?: string | null }>;
}> => {
  const planned = legacyRows.flatMap((row, index) => {
    const match = matches[index];
    if (!match?.updateAllowed || !match.variant || !eligibleVariantIds.has(match.variant.id)) return [];
    const keys = keysForRow(row, byUrl);
    if (!keys.length) return [];
    const downloaded = row.imageUrls.filter((url) => byUrl.get(url)?.downloaded && byUrl.get(url)?.key).length;
    return [{ row, match, keys, downloaded, primary: keys[0] ?? '' }];
  });

  const updated: typeof planned = [];
  const cacheTargets: Array<{ refId: string; slug?: string | null }> = [];
  const seenTargets = new Set<string>();

  for (const item of planned) {
    const variant = item.match.variant!;
    await dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductMediaEntity);
      const existing = await repo.find({
        where: { variantId: variant.id, type: ProductMediaType.IMAGE },
        order: { sortOrder: 'ASC' },
      });
      const existingKeys = new Set(existing.map(mediaKey).filter(Boolean));
      const missingKeys = item.keys.filter((key) => !existingKeys.has(key));
      const hasPrimary = existing.some((media) => media.isPrimary);
      const sortOrder = existing.reduce((max, media) => Math.max(max, media.sortOrder ?? 0), -1);

      if (missingKeys.length) {
        await repo.save(
          missingKeys.map((key, index) =>
            repo.create({
              productId: variant.productId,
              variantId: variant.id,
              type: ProductMediaType.IMAGE,
              url: storage.persistFileReference(key)!,
              sortOrder: sortOrder + 1 + index,
              isPrimary: false,
            }),
          ),
        );
      }

      if (!hasPrimary) {
        const stored = await repo.find({
          where: { variantId: variant.id, type: ProductMediaType.IMAGE },
          order: { sortOrder: 'ASC' },
        });
        const primaryKey = item.keys.find((key) => stored.some((media) => mediaKey(media) === key));
        const primary = stored.find((media) => mediaKey(media) === primaryKey) ?? stored[0];
        if (primary && !primary.isPrimary) {
          await repo.update({ id: primary.id }, { isPrimary: true });
        }
      }
    });

    updated.push(item);
    if (variant.productRefId && !seenTargets.has(variant.productRefId)) {
      seenTargets.add(variant.productRefId);
      cacheTargets.push({ refId: variant.productRefId, slug: variant.productSlug });
    }
    console.log(
      `[product:reconcile-legacy-images] DB ${variant.id} sku=${variant.sku} keys=${item.keys.length}`,
    );
  }

  return { updated, cacheTargets };
};

const countConflicts = (matches: ClassifiedLegacyMatch[]): number =>
  matches.filter((match) => !match.updateAllowed && match.kind !== 'not_in_db').length;

const describeDatabaseTarget = (dataSource: DataSource): string => {
  const rawUrl = (dataSource.options as { url?: string }).url ?? process.env['DATABASE_URL'] ?? '';
  if (!rawUrl) return '(DATABASE_URL unset)';
  try {
    const parsed = new URL(rawUrl);
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return '(DATABASE_URL set)';
  }
};

interface TechbvSummary {
  totalLegacyRows: number;
  totalMatched: number;
  totalUnmatched: number;
  totalProcessed: number;
  totalImagesReused: number;
  totalImagesDownloaded: number;
  totalDbUpdates: number;
  totalCacheUpdates: number;
  totalFailures: number;
  totalConflicts: number;
}

const buildTechbvSummary = (
  legacyRows: IdSkuImageRow[],
  legacyMatches: ClassifiedLegacyMatch[],
  byUrl: Map<string, UrlOutcome>,
  dbUpdates: number,
  cacheUpdates: number,
): TechbvSummary => {
  const matchedIndexes = legacyMatches.flatMap((match, index) => (match.updateAllowed ? [index] : []));
  const seenUrls = new Set<string>();
  let reused = 0;
  let downloaded = 0;
  let failures = 0;
  for (const index of matchedIndexes) {
    for (const url of legacyRows[index]?.imageUrls ?? []) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      const outcome = byUrl.get(url);
      if (!outcome) continue;
      if (outcome.key && outcome.downloaded) downloaded += 1;
      else if (outcome.key) reused += 1;
      else if (outcome.error && outcome.error !== 'Deferred by --limit') failures += 1;
    }
  }
  return {
    totalLegacyRows: legacyRows.length,
    totalMatched: matchedIndexes.length,
    totalUnmatched: countKind(legacyMatches, 'not_in_db'),
    totalProcessed: byUrl.size > 0 ? matchedIndexes.length : 0,
    totalImagesReused: reused,
    totalImagesDownloaded: downloaded,
    totalDbUpdates: dbUpdates,
    totalCacheUpdates: cacheUpdates,
    totalFailures: failures,
    totalConflicts: countConflicts(legacyMatches),
  };
};

const printTechbvSummary = (summary: TechbvSummary): void => {
  console.log('[product:reconcile-legacy-images:test] summary');
  console.log(`Total legacy rows: ${summary.totalLegacyRows}`);
  console.log(`Total matched in current DB: ${summary.totalMatched}`);
  console.log(`Total unmatched: ${summary.totalUnmatched}`);
  console.log(`Total processed: ${summary.totalProcessed}`);
  console.log(`Total images reused: ${summary.totalImagesReused}`);
  console.log(`Total images downloaded: ${summary.totalImagesDownloaded}`);
  console.log(`Total DB updates: ${summary.totalDbUpdates}`);
  console.log(`Total cache updates: ${summary.totalCacheUpdates}`);
  console.log(`Total failures: ${summary.totalFailures}`);
  console.log(`Total conflicts: ${summary.totalConflicts}`);
};

const rowImageStats = (
  row: IdSkuImageRow,
  byUrl: Map<string, UrlOutcome>,
): { downloaded: number; reused: number; primary: string; error: string } => {
  let downloaded = 0;
  let reused = 0;
  const errors: string[] = [];
  const keys: string[] = [];
  for (const url of row.imageUrls) {
    const outcome = byUrl.get(url);
    if (!outcome) continue;
    if (outcome.key) {
      if (!keys.includes(outcome.key)) keys.push(outcome.key);
      if (outcome.downloaded) downloaded += 1;
      else reused += 1;
    } else if (outcome.error && outcome.error !== 'Deferred by --limit') {
      errors.push(outcome.error);
    }
  }
  return { downloaded, reused, primary: keys[0] ?? '', error: errors.join('; ') };
};

const writeTechbvReport = async (input: {
  reportPath: string;
  legacyRows: IdSkuImageRow[];
  legacyMatches: ClassifiedLegacyMatch[];
  outcomes: { byUrl: Map<string, UrlOutcome> };
  updatedVariantIds: Set<string>;
  cacheUpdated: boolean;
  cacheUpdateCount?: number;
  dryRun: boolean;
}): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const resultRows = input.legacyRows.flatMap((row, index) => {
    const match = input.legacyMatches[index];
    if (!match?.updateAllowed) return [];
    const stats = rowImageStats(row, input.outcomes.byUrl);
    const dbUpdated = Boolean(match.variant && input.updatedVariantIds.has(match.variant.id));
    return [
      {
        productId: row.productId,
        sku: row.sku,
        variantId: match.variant?.id ?? '',
        matchType: match.kind,
        legacyCount: row.imageUrls.length,
        downloaded: stats.downloaded,
        reused: stats.reused,
        primary: stats.primary,
        dbUpdated,
        cacheUpdated: dbUpdated && input.cacheUpdated,
        error: input.dryRun ? 'Dry run — no download or database write' : stats.error,
      },
    ];
  });
  addSheet(
    workbook,
    'Results',
    [
      { header: 'Product Id', key: 'productId', width: 16 },
      { header: 'SKU', key: 'sku', width: 24 },
      { header: 'DB Variant ID', key: 'variantId', width: 38 },
      { header: 'Match Type', key: 'matchType', width: 28 },
      { header: 'Legacy Image Count', key: 'legacyCount', width: 22 },
      { header: 'Downloaded Image Count', key: 'downloaded', width: 26 },
      { header: 'Reused GCS Image Count', key: 'reused', width: 26 },
      { header: 'Primary Image', key: 'primary', width: 40 },
      { header: 'DB Update Status', key: 'dbUpdated', width: 18 },
      { header: 'Cache Update Status', key: 'cacheUpdated', width: 20 },
      { header: 'Failure Reason', key: 'error', width: 60 },
    ],
    resultRows,
  );

  const summary = buildTechbvSummary(
    input.legacyRows,
    input.legacyMatches,
    input.outcomes.byUrl,
    input.updatedVariantIds.size,
    input.cacheUpdateCount ?? (input.cacheUpdated ? input.updatedVariantIds.size : 0),
  );
  addSheet(
    workbook,
    'Summary',
    [
      { header: 'Metric', key: 'metric', width: 36 },
      { header: 'Count', key: 'count', width: 12 },
    ],
    [
      { metric: 'Total legacy rows', count: summary.totalLegacyRows },
      { metric: 'Total matched in current DB', count: summary.totalMatched },
      { metric: 'Total unmatched', count: summary.totalUnmatched },
      { metric: 'Total processed', count: summary.totalProcessed },
      { metric: 'Total images reused', count: summary.totalImagesReused },
      { metric: 'Total images downloaded', count: summary.totalImagesDownloaded },
      { metric: 'Total DB updates', count: summary.totalDbUpdates },
      { metric: 'Total cache updates', count: summary.totalCacheUpdates },
      { metric: 'Total failures', count: summary.totalFailures },
      { metric: 'Total conflicts', count: summary.totalConflicts },
    ],
  );

  const conflicts = input.legacyRows.flatMap((row, index) => {
    const match = input.legacyMatches[index];
    if (!match || match.updateAllowed || match.kind === 'not_in_db') return [];
    return [{ productId: row.productId, sku: row.sku, kind: match.kind, reason: match.reason }];
  });
  addSheet(
    workbook,
    'Conflicts',
    [
      { header: 'Product Id', key: 'productId', width: 16 },
      { header: 'SKU', key: 'sku', width: 24 },
      { header: 'Conflict', key: 'kind', width: 36 },
      { header: 'Reason', key: 'reason', width: 60 },
    ],
    conflicts,
  );

  await mkdir(resolve(input.reportPath, '..'), { recursive: true });
  await workbook.xlsx.writeFile(input.reportPath);
  console.log(`[product:reconcile-legacy-images:test] report=${input.reportPath}`);
};

const validateUpdatedVariants = async (
  dataSource: DataSource,
  storage: StorageService,
  cache: Map<string, string>,
  updated: Array<{ match: ClassifiedLegacyMatch; keys: string[]; primary: string }>,
): Promise<{ failures: number }> => {
  let failures = 0;
  const cacheValues = new Set(cache.values());
  const repo = dataSource.getRepository(ProductMediaEntity);
  for (const group of chunk(updated, DB_CHUNK)) {
    const ids = group.map((item) => item.match.variant!.id);
    const media = await repo.find({
      where: { variantId: In(ids), type: ProductMediaType.IMAGE },
    });
    const byVariant = new Map<string, ProductMediaEntity[]>();
    for (const row of media) {
      if (!row.variantId) continue;
      const list = byVariant.get(row.variantId) ?? [];
      list.push(row);
      byVariant.set(row.variantId, list);
    }
    for (const item of group) {
      const rows = byVariant.get(item.match.variant!.id) ?? [];
      const keys = new Set(rows.map(mediaKey));
      const primaryOk = rows.some((row) => row.isPrimary);
      const keysOk = item.keys.every((key) => keys.has(key) && cacheValues.has(key));
      const exists = item.primary ? await storage.exists(item.primary) : false;
      if (!rows.length || !primaryOk || !keysOk || !exists) {
        failures += 1;
        console.error(
          `[product:reconcile-legacy-images] validation failed variant=${item.match.variant!.id} images=${rows.length} primary=${primaryOk} keys=${keysOk} gcs=${exists}`,
        );
      }
    }
  }
  return { failures };
};

const writeReport = async (input: {
  reportPath: string;
  legacyRows: IdSkuImageRow[];
  legacyMatches: ClassifiedLegacyMatch[];
  missingRows: IdSkuImageRow[];
  outcomes: { byUrl: Map<string, UrlOutcome> };
  dbResult: {
    updated: Array<{
      row: IdSkuImageRow;
      match: ClassifiedLegacyMatch;
      keys: string[];
      downloaded: number;
      primary: string;
    }>;
  };
  cacheUpdated: boolean;
}): Promise<void> => {
  const legacyIndex = indexIdentities(input.legacyRows);
  const workbook = new ExcelJS.Workbook();

  addSheet(
    workbook,
    'Updated',
    [
      { header: 'Product Id', key: 'productId', width: 16 },
      { header: 'SKU', key: 'sku', width: 24 },
      { header: 'DB Variant ID', key: 'variantId', width: 38 },
      { header: 'Match Type', key: 'matchType', width: 28 },
      { header: 'Legacy Image URL Count', key: 'legacyCount', width: 24 },
      { header: 'Successfully Downloaded Count', key: 'downloaded', width: 30 },
      { header: 'GCS Image Count', key: 'gcsCount', width: 18 },
      { header: 'Primary Image', key: 'primary', width: 40 },
      { header: 'DB Updated', key: 'dbUpdated', width: 14 },
      { header: 'Cache Updated', key: 'cacheUpdated', width: 16 },
    ],
    input.dbResult.updated.map((item) => ({
      productId: item.row.productId,
      sku: item.row.sku,
      variantId: item.match.variant?.id ?? '',
      matchType: item.match.kind,
      legacyCount: item.row.imageUrls.length,
      downloaded: item.downloaded,
      gcsCount: item.keys.length,
      primary: item.primary,
      dbUpdated: true,
      cacheUpdated: input.cacheUpdated,
    })),
  );

  const failureRows: Array<Record<string, string | number | boolean>> = [];
  input.legacyRows.forEach((row) => {
    for (const url of row.imageUrls) {
      const outcome = input.outcomes.byUrl.get(url);
      if (!outcome?.error || outcome.key) continue;
      if (outcome.error === 'Deferred by --limit') continue;
      failureRows.push({
        productId: row.productId,
        sku: row.sku,
        url,
        error: outcome.error,
        reason: outcome.error,
      });
    }
  });
  addSheet(
    workbook,
    'Download Failures',
    [
      { header: 'Product Id', key: 'productId', width: 16 },
      { header: 'SKU', key: 'sku', width: 24 },
      { header: 'Legacy URL', key: 'url', width: 80 },
      { header: 'HTTP Status / Error', key: 'error', width: 40 },
      { header: 'Failure Reason', key: 'reason', width: 40 },
    ],
    failureRows,
  );

  const notInDb = input.legacyRows.flatMap((row, index) => {
    const match = input.legacyMatches[index];
    if (match?.kind !== 'not_in_db') return [];
    const keys = keysForRow(row, input.outcomes.byUrl);
    return [
      {
        productId: row.productId,
        sku: row.sku,
        urls: row.imageUrls.join(', '),
        backedUp: keys.length,
        primary: keys[0] ?? '',
        dbMatch: false,
      },
    ];
  });
  addSheet(
    workbook,
    'Not In DB',
    [
      { header: 'Product Id', key: 'productId', width: 16 },
      { header: 'SKU', key: 'sku', width: 24 },
      { header: 'Image URLs', key: 'urls', width: 80 },
      { header: 'Images Successfully Backed Up', key: 'backedUp', width: 30 },
      { header: 'Primary Image', key: 'primary', width: 40 },
      { header: 'DB Match Status', key: 'dbMatch', width: 18 },
    ],
    notInDb,
  );

  const missingNone = input.missingRows.flatMap((row) => {
    const match = matchMissingToLegacy(row, input.legacyRows, legacyIndex.bySku, legacyIndex.byProductId);
    if (match.status !== 'none') return [];
    return [{ productId: row.productId, sku: row.sku, reason: match.reason }];
  });
  addSheet(
    workbook,
    'Missing Without Legacy',
    [
      { header: 'Product Id', key: 'productId', width: 16 },
      { header: 'SKU', key: 'sku', width: 24 },
      { header: 'Reason', key: 'reason', width: 40 },
    ],
    missingNone,
  );

  const conflicts: Array<{ productId: string; sku: string; kind: string; reason: string }> = input.legacyRows.flatMap((row, index) => {
    const match = input.legacyMatches[index];
    if (!match || match.updateAllowed || match.kind === 'not_in_db') return [];
    return [{ productId: row.productId, sku: row.sku, kind: match.kind, reason: match.reason }];
  });
  for (const row of input.missingRows) {
    const match = matchMissingToLegacy(row, input.legacyRows, legacyIndex.bySku, legacyIndex.byProductId);
    if (match.status !== 'conflict') continue;
    conflicts.push({ productId: row.productId, sku: row.sku, kind: 'missing_sheet_conflict', reason: match.reason });
  }
  addSheet(
    workbook,
    'Conflicts',
    [
      { header: 'Product Id', key: 'productId', width: 16 },
      { header: 'SKU', key: 'sku', width: 24 },
      { header: 'Conflict', key: 'kind', width: 36 },
      { header: 'Reason', key: 'reason', width: 60 },
    ],
    conflicts,
  );

  await mkdir(resolve(input.reportPath, '..'), { recursive: true });
  await workbook.xlsx.writeFile(input.reportPath);
  console.log(`[product:reconcile-legacy-images] report=${input.reportPath}`);
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[product:reconcile-legacy-images] failed:', error);
    process.exit(1);
  });
