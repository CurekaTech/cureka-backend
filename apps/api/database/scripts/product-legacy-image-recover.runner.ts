/**
 * Recover missing variant images, and harvest legacy images for SKU + product ID
 * pairs that are not in the database yet.
 *
 * Dry-run unless --apply. A stored GCS key is reused and is not downloaded again.
 * --limit counts new legacy downloads, not rows scanned.
 *
 * Usage:
 *   npm run product:recover-legacy-images
 *   npm run product:recover-legacy-images -- --apply
 *   npm run product:recover-legacy-images -- --apply --limit=500
 *   npm run product:recover-legacy-images -- --test --apply --limit=50
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
import { toLegacyCurekaImageUrl } from '@modules/product/utils/bulk-upload-image.util';
import {
  DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
  DEFAULT_IMAGE_HARVEST_CACHE_FILE,
  normalizeLookupSku,
} from '@modules/product/utils/bulk-upload-reference-lookup.util';
import {
  forgetHarvestCacheKey,
  loadIdSkuImageSheet,
  rememberHarvestCacheKey,
  validateBackedUpImageBuffer,
  type HarvestMapRow,
  type VariantMatchCandidate,
} from '@modules/product/utils/legacy-image-reconcile.util';
import {
  applyOrphanMapUpdate,
  classifyOrphanResult,
  findMapKeysForPair,
  groupLegacyRows,
  indexVariantsByPair,
  lookupLegacyPair,
  mergeReuseKeys,
  orphanPairs,
  recoverPairKey,
  splitUrlsByCache,
  upsertPairMapRow,
  variantNeedsImageRecovery,
  variantRecoverIdentity,
  type GroupedLegacyPair,
  type RecoverIdentity,
} from '@modules/product/utils/legacy-image-recover.util';
import {
  loadHarvestCache,
  saveHarvestCache,
  writeHarvestedImageRows,
} from '@modules/product/utils/wp-image-harvest.util';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_LEGACY_FILE = 'docs/Master-Data-Sheets/legacy-image-urls-10-09.xlsx';
const DEFAULT_REPORT_FILE = 'docs/Master-Data-Sheets/legacy-image-recover-report.xlsx';
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const CACHE_FLUSH_EVERY = 25;
const DB_CHUNK = 400;
const LOG = '[product:recover-legacy-images]';

interface CliOptions {
  file: string;
  cache: string;
  out: string;
  report: string;
  apply: boolean;
  test: boolean;
  skus: Set<string>;
  limit?: number;
  concurrency: number;
}

interface ReportRow {
  sku: string;
  externalProductId: string;
  productId: string;
  productName: string;
  dbMatch: string;
  gcsKeys: string;
  legacyUrls: string;
  action: string;
  result: string;
  reason: string;
}

interface UrlOutcome {
  key?: string;
  error?: string;
  downloaded: boolean;
  deferred: boolean;
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
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
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

const mediaKey = (media: ProductMediaEntity): string => {
  const url = media.url as { key?: string } | null;
  return typeof url?.key === 'string' ? url.key.trim() : '';
};

const printUsage = (): void => {
  console.log(`
Recover missing variant images and harvest legacy images that are not in the DB yet.

Examples:
  npm run product:recover-legacy-images
  npm run product:recover-legacy-images -- --apply
  npm run product:recover-legacy-images -- --apply --limit=500
  npm run product:recover-legacy-images -- --test --apply --limit=50

Options:
  --file <path>       Legacy image workbook (ID, SKU, Images)
  --cache <path>      Harvest cache JSON (URL → GCS key)
  --out <path>        Harvested GCS map workbook
  --report <path>     Recovery report workbook
  --apply             Download, write cache/map, and update product_media
  --test              DB recovery only. Does not harvest legacy rows that are not in the DB
  --dry-run           Preview only. This is the default, and it overrides --apply
  --sku <list>        Comma-separated SKUs to consider
  --limit <n>         Max new legacy downloads. Already stored objects are free
  --concurrency <n>   Parallel downloads (default ${DEFAULT_CONCURRENCY})
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_LEGACY_FILE,
    cache: DEFAULT_IMAGE_HARVEST_CACHE_FILE,
    out: DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
    report: DEFAULT_REPORT_FILE,
    apply: false,
    test: false,
    skus: new Set<string>(),
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
    else if (arg === '--test') options.test = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--file' || arg.startsWith('--file=')) options.file = valueOf();
    else if (arg === '--cache' || arg.startsWith('--cache=')) options.cache = valueOf();
    else if (arg === '--out' || arg.startsWith('--out=')) options.out = valueOf();
    else if (arg === '--report' || arg.startsWith('--report=')) options.report = valueOf();
    else if (arg === '--sku' || arg.startsWith('--sku=')) {
      for (const part of valueOf().split(',')) {
        const sku = normalizeLookupSku(part);
        if (sku) options.skus.add(sku);
      }
    } else if (arg === '--limit' || arg.startsWith('--limit=')) {
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

const loadVariantCandidates = async (
  variantRepo: Repository<ProductVariantEntity>,
  productRepo: Repository<ProductEntity>,
): Promise<{ variants: VariantMatchCandidate[]; names: Map<string, string> }> => {
  const variants = await variantRepo.find({
    select: ['id', 'sku', 'externalProductId', 'productId'],
  });
  const productIds = [...new Set(variants.map((variant) => variant.productId))];
  const products = new Map<string, ProductEntity>();
  for (const ids of chunk(productIds, DB_CHUNK)) {
    const rows = await productRepo.find({
      where: { id: In(ids) },
      select: ['id', 'refId', 'slug', 'externalProductId', 'name'],
    });
    for (const product of rows) products.set(product.id, product);
  }
  const names = new Map<string, string>();
  const candidates = variants.map((variant) => {
    const product = products.get(variant.productId);
    names.set(variant.productId, product?.name ?? '');
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
  return { variants: candidates, names };
};

const addSheet = (
  workbook: ExcelJS.Workbook,
  name: string,
  rows: ReportRow[],
): void => {
  const worksheet = workbook.addWorksheet(name.slice(0, 31));
  worksheet.columns = [
    { header: 'SKU', key: 'sku', width: 24 },
    { header: 'Legacy Product ID', key: 'externalProductId', width: 22 },
    { header: 'Product UUID', key: 'productId', width: 38 },
    { header: 'Product Name', key: 'productName', width: 32 },
    { header: 'DB Match', key: 'dbMatch', width: 12 },
    { header: 'GCS Keys', key: 'gcsKeys', width: 48 },
    { header: 'Legacy URLs', key: 'legacyUrls', width: 64 },
    { header: 'Action', key: 'action', width: 28 },
    { header: 'Result', key: 'result', width: 32 },
    { header: 'Reason', key: 'reason', width: 48 },
  ];
  for (const row of rows) worksheet.addRow(row);
};

const reportRow = (
  identity: RecoverIdentity,
  fields: Partial<ReportRow> & Pick<ReportRow, 'action' | 'result' | 'reason'>,
): ReportRow => ({
  sku: identity.sku,
  externalProductId: identity.productId,
  productId: '',
  productName: '',
  dbMatch: 'NO',
  gcsKeys: '',
  legacyUrls: '',
  ...fields,
});

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const legacyPath = absolutePath(options.file);
  const cachePath = absolutePath(options.cache);
  const outPath = absolutePath(options.out);
  const reportPath = absolutePath(options.report);

  console.log(`${LOG} file=${legacyPath}`);
  console.log(`${LOG} cache=${cachePath}`);
  console.log(`${LOG} out=${outPath}`);
  console.log(`${LOG} report=${reportPath}`);
  console.log(`${LOG} apply=${options.apply} test=${options.test} limit=${options.limit ?? 'none'} skus=${options.skus.size}`);
  if (options.test) {
    console.log(`${LOG} Mode: TEST`);
    console.log(`${LOG} Phase: DB RECOVERY ONLY`);
    console.log(`${LOG} Orphan harvesting: DISABLED`);
  }

  if (!(await fileExists(legacyPath))) {
    throw new Error(`Legacy image sheet is missing (${legacyPath})`);
  }

  const legacyRows = await loadIdSkuImageSheet(legacyPath, { requireImages: true });
  const sheet = groupLegacyRows(legacyRows);
  const cache = await loadHarvestCache(cachePath);
  let mapRows: HarvestMapRow[] = [];
  if (await fileExists(outPath)) {
    const loaded = await loadIdSkuImageSheet(outPath);
    mapRows = loaded
      .filter((row) => row.productId || row.sku)
      .map((row) => ({ productId: row.productId, sku: row.sku, keys: row.imageUrls }));
  }
  console.log(`${LOG} legacyRows=${legacyRows.length} pairs=${sheet.byPair.size} cacheUrls=${cache.size} mapRows=${mapRows.length}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    console.log(`${LOG} database=${describeDatabaseTarget(dataSource)}`);
    const storage = app.get(StorageService);
    const { variants, names } = await loadVariantCandidates(
      dataSource.getRepository(ProductVariantEntity),
      dataSource.getRepository(ProductEntity),
    );
    const variantsByPair = indexVariantsByPair(variants);
    const mediaByVariant = await loadImageMedia(dataSource, variants.map((variant) => variant.id));
    const validatedKeys = new Map<string, boolean>();

    const keyIsValid = async (key: string): Promise<boolean> => {
      const known = validatedKeys.get(key);
      if (known !== undefined) return known;
      let valid = false;
      try {
        if (await storage.exists(key)) {
          const buffer = await storage.readObjectBuffer(key, DEFAULT_MAX_IMAGE_BYTES);
          valid = validateBackedUpImageBuffer(buffer, DEFAULT_MAX_IMAGE_BYTES).ok;
        }
      } catch {
        valid = false;
      }
      validatedKeys.set(key, valid);
      return valid;
    };

    const mediaKeys = new Set<string>();
    for (const images of mediaByVariant.values()) {
      for (const media of images) {
        const key = mediaKey(media);
        if (key) mediaKeys.add(key);
      }
    }
    console.log(`${LOG} validating ${mediaKeys.size} existing image keys`);
    let validated = 0;
    await mapPool([...mediaKeys], options.concurrency, async (key) => {
      await keyIsValid(key);
      validated += 1;
      if (validated % 200 === 0) console.log(`${LOG} existing images ${validated}/${mediaKeys.size}`);
    });

    const skuAllowed = (sku: string): boolean => options.skus.size === 0 || options.skus.has(sku);
    const report: ReportRow[] = [];
    const downloadUrls: string[] = [];
    const seenDownloads = new Set<string>();
    const queueDownload = (url: string): void => {
      if (seenDownloads.has(url)) return;
      seenDownloads.add(url);
      downloadUrls.push(url);
    };

    interface DbJob {
      variant: VariantMatchCandidate;
      identity: RecoverIdentity;
      imageUrls: string[];
      mapKeys: string[];
    }
    const dbJobs: DbJob[] = [];
    let variantsChecked = 0;
    let missingOrInvalid = 0;

    for (const variant of variants) {
      if (!skuAllowed(normalizeLookupSku(variant.sku))) continue;
      variantsChecked += 1;
      const images = mediaByVariant.get(variant.id) ?? [];
      const checked: Array<{ key: string; valid: boolean }> = [];
      for (const media of images) {
        const key = mediaKey(media);
        if (!key) {
          checked.push({ key: '', valid: false });
          continue;
        }
        checked.push({ key, valid: await keyIsValid(key) });
      }
      if (!variantNeedsImageRecovery(checked)) continue;
      missingOrInvalid += 1;
      const identity = variantRecoverIdentity(variant);
      if (!identity) {
        report.push(reportRow(
          { sku: normalizeLookupSku(variant.sku), productId: '' },
          {
            productId: variant.productId,
            productName: names.get(variant.productId) ?? '',
            dbMatch: 'YES',
            action: 'SKIP',
            result: 'No legacy match',
            reason: 'SKU and Product ID are both required',
          },
        ));
        continue;
      }
      const owners = variantsByPair.get(recoverPairKey(identity)) ?? [];
      if (owners.length > 1) {
        report.push(reportRow(identity, {
          productId: variant.productId,
          productName: names.get(variant.productId) ?? '',
          dbMatch: 'YES',
          action: 'SKIP',
          result: 'Conflict',
          reason: 'More than one DB variant has this SKU and Product ID',
        }));
        continue;
      }
      const legacy = lookupLegacyPair(sheet, identity.sku, identity.productId);
      if (legacy.status !== 'match') {
        report.push(reportRow(identity, {
          productId: variant.productId,
          productName: names.get(variant.productId) ?? '',
          dbMatch: 'YES',
          action: 'SKIP',
          result: legacyResult(legacy.status),
          reason: legacy.reason,
        }));
        continue;
      }
      const mapLookup = findMapKeysForPair(mapRows, identity.sku, identity.productId);
      if (mapLookup.status === 'conflict') {
        report.push(reportRow(identity, {
          productId: variant.productId,
          productName: names.get(variant.productId) ?? '',
          dbMatch: 'YES',
          legacyUrls: legacy.imageUrls.join(', '),
          action: 'SKIP',
          result: 'Conflict',
          reason: mapLookup.reason,
        }));
        continue;
      }
      dbJobs.push({
        variant,
        identity,
        imageUrls: legacy.imageUrls,
        mapKeys: mapLookup.status === 'keys' ? mapLookup.keys : [],
      });
    }
    console.log(`${LOG} variants=${variantsChecked} missingOrInvalid=${missingOrInvalid} dbJobs=${dbJobs.length}`);

    const invalidKeys = new Set<string>();
    if (options.apply) {
      const keysToCheck = new Set<string>();
      for (const job of dbJobs) {
        for (const item of splitUrlsByCache(job.imageUrls, cache).reuse) keysToCheck.add(item.key);
        for (const key of job.mapKeys) keysToCheck.add(key);
      }
      let checked = 0;
      await mapPool([...keysToCheck], options.concurrency, async (key) => {
        const valid = await keyIsValid(key);
        if (!valid) {
          invalidKeys.add(key);
          forgetHarvestCacheKey(cache, key);
        }
        checked += 1;
        if (checked % 100 === 0) console.log(`${LOG} checked backup keys ${checked}/${keysToCheck.size}`);
      });
    }

    for (const job of dbJobs) {
      for (const url of splitUrlsByCache(job.imageUrls, cache, invalidKeys).download) queueDownload(url);
    }

    const orphanJobs: Array<{ pair: GroupedLegacyPair; imageUrls: string[]; mapKeys: string[] }> = [];
    for (const pair of options.test ? [] : orphanPairs(sheet, variantsByPair)) {
      if (!skuAllowed(pair.identity.sku)) continue;
      if (pair.status === 'conflict') {
        report.push(reportRow(pair.identity, {
          action: 'SKIP',
          result: 'Conflict',
          reason: pair.reason,
        }));
        continue;
      }
      const mapLookup = findMapKeysForPair(mapRows, pair.identity.sku, pair.identity.productId);
      if (mapLookup.status === 'conflict') {
        report.push(reportRow(pair.identity, {
          legacyUrls: pair.imageUrls.join(', '),
          action: 'SKIP',
          result: 'Conflict',
          reason: mapLookup.reason,
        }));
        continue;
      }
      const mapKeys = mapLookup.status === 'keys' ? mapLookup.keys : [];
      orphanJobs.push({ pair, imageUrls: pair.imageUrls, mapKeys });
      for (const url of splitUrlsByCache(pair.imageUrls, cache, invalidKeys).download) queueDownload(url);
    }
    console.log(
      `${LOG} orphanJobs=${orphanJobs.length} pendingDownloads=${downloadUrls.length}${options.test ? ' orphanHarvest=disabled' : ''}`,
    );

    const outcomes = new Map<string, UrlOutcome>();
    if (options.apply && downloadUrls.length) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      let backedUp = false;
      if (await fileExists(cachePath)) {
        await copyFile(cachePath, `${cachePath}.bak-${stamp}`);
        backedUp = true;
      }
      if (await fileExists(outPath)) {
        await copyFile(outPath, `${outPath}.bak-${stamp}`);
        backedUp = true;
      }
      if (backedUp) console.log(`${LOG} backups written with stamp ${stamp}`);
      await downloadMissing(downloadUrls, outcomes, cache, cachePath, outPath, () => mapRows, storage, options);
    } else if (!options.apply) {
      for (const url of downloadUrls) {
        outcomes.set(url, { downloaded: false, deferred: false, error: 'Dry run' });
      }
    }

    const cacheTargets: Array<{ refId: string; slug?: string | null }> = [];
    let dbUpdates = 0;
    let downloads = 0;
    let uploads = 0;
    let reused = 0;
    for (const outcome of outcomes.values()) {
      if (outcome.downloaded && outcome.key) {
        downloads += 1;
        uploads += 1;
      }
    }

    for (const job of dbJobs) {
      const resolved = resolveJob(job.imageUrls, job.mapKeys, cache, invalidKeys, outcomes);
      reused += resolved.reused;
      const rowBase = {
        productId: job.variant.productId,
        productName: names.get(job.variant.productId) ?? '',
        dbMatch: 'YES',
        gcsKeys: resolved.keys.join(', '),
        legacyUrls: job.imageUrls.join(', '),
      };
      if (!resolved.keys.length) {
        report.push(reportRow(job.identity, {
          ...rowBase,
          action: resolved.deferred ? 'DEFERRED' : 'SKIP',
          result: resolved.deferred ? 'Deferred' : failureSheet(resolved.errors),
          reason: resolved.errors[0] ?? 'No valid image',
        }));
        continue;
      }
      if (!options.apply) {
        report.push(reportRow(job.identity, {
          ...rowBase,
          action: resolved.downloaded ? 'DOWNLOAD_AND_UPLOAD' : 'REUSE',
          result: dbResultName(resolved),
          reason: jobReason(resolved, 'Dry run'),
        }));
        continue;
      }
      try {
        const current = mediaByVariant.get(job.variant.id) ?? [];
        await writeVariantImages(dataSource, storage, job.variant, current, resolved.keys);
        dbUpdates += 1;
        mapRows = upsertPairMapRow(mapRows, {
          sku: job.identity.sku,
          productId: job.identity.productId,
          keys: resolved.keys,
        });
        if (job.variant.productRefId) {
          cacheTargets.push({ refId: job.variant.productRefId, slug: job.variant.productSlug });
        }
        report.push(reportRow(job.identity, {
          ...rowBase,
          action: resolved.downloaded ? 'DOWNLOAD_AND_UPLOAD' : 'REUSE',
          result: dbResultName(resolved),
          reason: jobReason(resolved, 'Stored'),
        }));
        for (const error of resolved.errors) {
          report.push(reportRow(job.identity, {
            ...rowBase,
            action: 'SKIP',
            result: error.includes('GCS validation failed') ? 'GCS failure' : 'Download failure',
            reason: error,
          }));
        }
        console.log(`${LOG} DB ${job.variant.id} sku=${job.identity.sku} keys=${resolved.keys.length}`);
      } catch (error) {
        report.push(reportRow(job.identity, {
          ...rowBase,
          action: 'SKIP',
          result: 'DB failure',
          reason: describeError(error),
        }));
      }
    }

    let backupReused = 0;
    let backupCreated = 0;
    let backupFailed = 0;
    let backupNone = 0;
    for (const job of orphanJobs) {
      if (job.pair.status !== 'ready') continue;
      const resolved = resolveJob(job.imageUrls, job.mapKeys, cache, invalidKeys, outcomes);
      reused += resolved.reused;
      const result = classifyOrphanResult({
        imageUrls: job.imageUrls,
        downloaded: resolved.downloaded,
        failed: resolved.errors.length,
        reused: resolved.reused,
        deferred: resolved.deferred,
      });
      if (result === 'NOT_IN_DB_BACKUP_REUSED') backupReused += 1;
      else if (result === 'NOT_IN_DB_BACKUP_CREATED') backupCreated += 1;
      else if (result === 'NOT_IN_DB_BACKUP_FAILED') backupFailed += 1;
      else if (result === 'NOT_IN_DB_NO_VALID_IMAGE') backupNone += 1;
      if (options.apply && resolved.keys.length && job.pair.status === 'ready') {
        mapRows = applyOrphanMapUpdate(mapRows, job.pair, resolved.keys);
      }
      report.push(reportRow(job.pair.identity, {
        dbMatch: 'NO',
        gcsKeys: resolved.keys.join(', '),
        legacyUrls: job.imageUrls.join(', '),
        action: result === 'DEFERRED'
          ? 'DEFERRED'
          : resolved.downloaded
            ? 'DOWNLOAD_AND_UPLOAD'
            : resolved.keys.length
              ? 'REUSE'
              : 'SKIP',
        result: orphanSheet(result),
        reason: resolved.errors[0] ?? (options.apply ? 'No database write' : 'Dry run'),
      }));
    }

    if (options.apply) {
      await saveHarvestCache(cachePath, cache);
      await writeHarvestedImageRows(outPath, mapRows);
      const cacheResult = await invalidateProductCache(cacheTargets, false);
      console.log(`${LOG} redis=${cacheResult.connected} cacheKeysDeleted=${cacheResult.keysDeleted}`);
    }

    await writeReport(reportPath, report, options.test);
    for (const result of [
      'Valid backup',
      'Legacy recovery',
      'Invalid backup',
      'No legacy match',
      'SKU mismatch',
      'Product ID mismatch',
      'Conflict',
      'Download failure',
      'GCS failure',
      'DB failure',
      'Deferred',
    ]) {
      console.log(`${LOG} ${result}=${report.filter((row) => row.result === result).length}`);
    }
    console.log(`${LOG} variantsChecked=${variantsChecked}`);
    console.log(`${LOG} missingOrInvalid=${missingOrInvalid}`);
    console.log(`${LOG} gcsReused=${reused}`);
    console.log(`${LOG} downloaded=${downloads} uploaded=${uploads} dbUpdates=${dbUpdates}`);
    console.log(`${LOG} notInDbReused=${backupReused} notInDbCreated=${backupCreated} notInDbFailed=${backupFailed} notInDbNoImage=${backupNone}`);
    console.log(`${LOG} report=${reportPath}`);
  } finally {
    await app.close();
  }
}

const jobReason = (
  resolved: { errors: string[]; deferred: number; invalidBackup: boolean },
  fallback: string,
): string => {
  const deferred = resolved.deferred > 0 ? `${resolved.deferred} image(s) deferred by --limit` : '';
  return [resolved.errors[0], resolved.invalidBackup ? 'Cached GCS object was not a valid image' : '', deferred, fallback]
    .filter(Boolean)
    .join('; ');
};

const dbResultName = (resolved: { downloaded: number; deferred: number; invalidBackup: boolean }): string => {
  if (resolved.deferred > 0 && resolved.downloaded === 0 && !resolved.invalidBackup) return 'Deferred';
  if (resolved.invalidBackup) return 'Invalid backup';
  if (resolved.downloaded > 0) return 'Legacy recovery';
  return 'Valid backup';
};

const legacyResult = (status: string): string => {
  if (status === 'sku_mismatch') return 'SKU mismatch';
  if (status === 'product_id_mismatch') return 'Product ID mismatch';
  if (status === 'conflict') return 'Conflict';
  if (status === 'incomplete') return 'No legacy match';
  return 'No legacy match';
};

const failureSheet = (errors: string[]): string => {
  if (errors.some((error) => error.includes('GCS validation failed'))) return 'GCS failure';
  if (errors.length) return 'Download failure';
  return 'No legacy match';
};

const orphanSheet = (result: string): string => {
  if (result === 'NOT_IN_DB_BACKUP_REUSED') return 'Not in DB - Backup Reused';
  if (result === 'NOT_IN_DB_BACKUP_CREATED') return 'Not in DB - Backup Created';
  if (result === 'NOT_IN_DB_BACKUP_FAILED') return 'Not in DB - Backup Failed';
  if (result === 'DEFERRED') return 'Deferred';
  return 'Not in DB - No Valid Image';
};

const resolveJob = (
  imageUrls: string[],
  mapKeys: string[],
  cache: Map<string, string>,
  invalidKeys: ReadonlySet<string>,
  outcomes: Map<string, UrlOutcome>,
): {
  keys: string[];
  reused: number;
  downloaded: number;
  deferred: number;
  errors: string[];
  invalidBackup: boolean;
} => {
  const split = splitUrlsByCache(imageUrls, cache, invalidKeys);
  const keys = split.reuse.map((item) => item.key);
  const errors: string[] = [];
  let downloaded = 0;
  let deferred = 0;
  for (const url of split.download) {
    const outcome = outcomes.get(url);
    if (!outcome || outcome.deferred) {
      deferred += 1;
      continue;
    }
    if (outcome.error === 'Dry run') {
      downloaded += 1;
      continue;
    }
    if (outcome.key) {
      keys.push(outcome.key);
      if (outcome.downloaded) downloaded += 1;
      continue;
    }
    if (outcome.error) errors.push(`${url}: ${outcome.error}`);
  }
  const usableMapKeys = mapKeys.filter((key) => !invalidKeys.has(key));
  return {
    keys: mergeReuseKeys(keys, usableMapKeys),
    reused: split.reuse.length + usableMapKeys.length,
    downloaded,
    deferred,
    errors,
    invalidBackup: mapKeys.some((key) => invalidKeys.has(key)) || imageUrls.some((url) => {
      const cached = splitUrlsByCache([url], cache).reuse[0]?.key;
      return Boolean(cached && invalidKeys.has(cached));
    }),
  };
};

const loadImageMedia = async (
  dataSource: DataSource,
  variantIds: string[],
): Promise<Map<string, ProductMediaEntity[]>> => {
  const grouped = new Map<string, ProductMediaEntity[]>();
  const repo = dataSource.getRepository(ProductMediaEntity);
  for (const ids of chunk(variantIds, DB_CHUNK)) {
    const rows = await repo.find({
      where: { variantId: In(ids), type: ProductMediaType.IMAGE },
      order: { sortOrder: 'ASC' },
    });
    for (const row of rows) {
      if (!row.variantId) continue;
      const list = grouped.get(row.variantId) ?? [];
      list.push(row);
      grouped.set(row.variantId, list);
    }
  }
  return grouped;
};

const writeVariantImages = async (
  dataSource: DataSource,
  storage: StorageService,
  variant: VariantMatchCandidate,
  current: ProductMediaEntity[],
  keys: string[],
): Promise<void> => {
  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(ProductMediaEntity);
    const invalidIds = current.filter((media) => !keys.includes(mediaKey(media))).map((media) => media.id);
    if (invalidIds.length) await repo.delete({ id: In(invalidIds) });
    const kept = new Set(current.map(mediaKey).filter((key) => keys.includes(key)));
    const missing = keys.filter((key) => !kept.has(key));
    const hasPrimary = current.some((media) => media.isPrimary && keys.includes(mediaKey(media)));
    const sortOrder = current.reduce((max, media) => Math.max(max, media.sortOrder ?? 0), -1);
    const created = missing.flatMap((key, index) => {
      const url = storage.persistFileReference(key);
      if (!url) return [];
      return [
        repo.create({
          productId: variant.productId,
          variantId: variant.id,
          type: ProductMediaType.IMAGE,
          url,
          sortOrder: sortOrder + 1 + index,
          isPrimary: index === 0 && !hasPrimary,
        }),
      ];
    });
    if (created.length) await repo.save(created);
  });
};

const downloadMissing = async (
  urls: string[],
  outcomes: Map<string, UrlOutcome>,
  cache: Map<string, string>,
  cachePath: string,
  outPath: string,
  mapRows: () => HarvestMapRow[],
  storage: StorageService,
  options: CliOptions,
): Promise<void> => {
  const selected: string[] = [];
  for (const url of urls) {
    if (options.limit !== undefined && selected.length >= options.limit) {
      outcomes.set(url, { downloaded: false, deferred: true });
      continue;
    }
    selected.push(url);
  }
  console.log(`${LOG} thisRun=${selected.length} deferred=${urls.length - selected.length}`);
  let downloaded = 0;
  let sinceFlush = 0;
  let flushing = Promise.resolve();
  const flush = async (): Promise<void> => {
    const pending = flushing.then(async () => {
      await saveHarvestCache(cachePath, cache);
      await writeHarvestedImageRows(outPath, mapRows());
    });
    flushing = pending.then(() => undefined, () => undefined);
    await pending;
  };

  await mapPool(selected, options.concurrency, async (url) => {
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
      const upload = await storage.uploadImage({
        stream: Readable.from(buffer),
        mimetype: validation.mime ?? 'image/jpeg',
        originalFilename: basenameFromUrl(downloadUrl) || 'image.jpg',
        folder: UploadFolder.IMAGES,
        maxSizeOverride: DEFAULT_MAX_IMAGE_BYTES,
      });
      const stored = await storage.readObjectBuffer(upload.path, DEFAULT_MAX_IMAGE_BYTES);
      const storedCheck = validateBackedUpImageBuffer(stored, DEFAULT_MAX_IMAGE_BYTES);
      if (!storedCheck.ok) throw new Error(`GCS validation failed: ${storedCheck.error ?? 'invalid object'}`);
      rememberHarvestCacheKey(cache, url, upload.path);
      outcomes.set(url, { key: upload.path, downloaded: true, deferred: false });
      downloaded += 1;
      sinceFlush += 1;
      if (sinceFlush >= CACHE_FLUSH_EVERY) {
        sinceFlush = 0;
        await flush();
      }
      console.log(`${LOG} OK ${downloaded}/${selected.length} ${upload.path}`);
    } catch (error) {
      const reason = describeError(error);
      outcomes.set(url, { error: reason, downloaded: false, deferred: false });
      console.error(`${LOG} FAIL ${url}: ${reason}`);
    }
  });
  await flush();
};

const writeReport = async (reportPath: string, rows: ReportRow[], testMode: boolean): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  if (testMode) {
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Field', key: 'field', width: 24 },
      { header: 'Value', key: 'value', width: 24 },
    ];
    summary.addRow({ field: 'Mode', value: 'TEST' });
    summary.addRow({ field: 'Phase', value: 'DB RECOVERY ONLY' });
    summary.addRow({ field: 'Orphan harvesting', value: 'DISABLED' });
  }
  const sheets = [
    'Valid backup',
    'Legacy recovery',
    'Invalid backup',
    'No legacy match',
    'SKU mismatch',
    'Product ID mismatch',
    'Conflict',
    'Download failure',
    'GCS failure',
    'DB failure',
    'Deferred',
    ...(testMode
      ? []
      : [
          'Not in DB - Backup Reused',
          'Not in DB - Backup Created',
          'Not in DB - Backup Failed',
          'Not in DB - No Valid Image',
        ]),
  ];
  for (const name of sheets) {
    addSheet(workbook, name, rows.filter((row) => row.result === name));
  }
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  await workbook.xlsx.writeFile(reportPath);
};

run().catch((error) => {
  console.error(LOG, error);
  process.exit(1);
});
