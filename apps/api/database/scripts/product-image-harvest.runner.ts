/**
 * Harvest WooCommerce export images into GCS for sheet Product IDs that are
 * NOT already in DB as product/variant external_product_id.
 * Writes GCS map xlsx + JSON for bulk upload, plus failure reports.
 * See docs/PRODUCT_MEDIA_BACKFILL.md
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { join } from 'path';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import {
  DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
  DEFAULT_IMAGE_HARVEST_CACHE_FILE,
  DEFAULT_WP_IMAGE_EXPORT_FILE,
  loadImageUrlsByProductId,
  normalizeLookupProductId,
} from '@modules/product/utils/bulk-upload-reference-lookup.util';
import { LEGACY_CUREKA_ORIGIN } from '@modules/product/utils/bulk-upload-image.util';
import {
  collectUniqueImageUrls,
  filterImageUrlsByProductIds,
  loadHarvestCache,
  mapProductUrlsToGcsKeys,
  saveHarvestCache,
  writeHarvestedMappingJson,
  writeHarvestedMappingWorkbook,
} from '@modules/product/utils/wp-image-harvest.util';
import {
  absolutePath,
  basenameFromUrl,
  createReportDir,
  DEFAULT_MAX_IMAGE_BYTES,
  HarvestSummary,
  loadManifestIndex,
  loadOverrideMapping,
  mapPool,
  MediaReportRow,
  ManifestIndex,
  OverrideMapping,
  resolveImageSource,
  rowNow,
  writeCsvReport,
  writeJsonReport,
} from '@modules/product/utils/media-backfill';
import { ProductImageHarvestCommandModule } from './product-image-harvest.command.module';

const DEFAULT_CONCURRENCY = 3;
const CACHE_FLUSH_EVERY = 25;
const DEFAULT_REPORT_DIR = 'reports/product-image-harvest';

interface CliOptions {
  file: string;
  out: string;
  cache: string;
  apply: boolean;
  /** When true, harvest every sheet ID (old behavior). Default: only IDs missing from DB. */
  includeMatched: boolean;
  limit?: number;
  concurrency: number;
  manifest?: string;
  mapping?: string;
  reportDir: string;
}

const printUsage = (): void => {
  console.log(`
Harvest WC export images → GCS for sheet Product IDs NOT in DB (external_product_id)

Default: compare Excel ID to product/variant external_product_id; only unmatched IDs.
Writes docs/wp-product-image-gcs-map.xlsx + .json for bulk upload.

Examples:
  npm run product:harvest-images -- --apply --manifest=docs/legacy-uploads-manifest.tsv.gz
  npm run product:harvest-images -- --limit=20 --apply
  npm run product:harvest-images -- --include-matched --apply

Options:
  --file <path>          WC export xlsx
  --out <path>           Mapping xlsx (ID + GCS keys); also writes sibling .json
  --cache <path>         Resume cache JSON (URL → GCS key)
  --apply                Download + upload + write mapping
  --include-matched      Also harvest IDs already in DB (not recommended)
  --manifest <path>      legacy-uploads-manifest.tsv[.gz]
  --mapping <path>       legacy-media-overrides.csv
  --report-dir <path>    Default ${DEFAULT_REPORT_DIR}
  --limit <n>            Max new unique URLs
  --concurrency <n>      Parallel downloads (default ${DEFAULT_CONCURRENCY})
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_WP_IMAGE_EXPORT_FILE,
    out: DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
    cache: DEFAULT_IMAGE_HARVEST_CACHE_FILE,
    apply: false,
    includeMatched: false,
    concurrency: DEFAULT_CONCURRENCY,
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
    if (arg === '--include-matched') {
      options.includeMatched = true;
      continue;
    }
    if (arg === '--file' || arg.startsWith('--file=')) {
      options.file = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? options.file;
      continue;
    }
    if (arg === '--out' || arg.startsWith('--out=')) {
      options.out = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? options.out;
      continue;
    }
    if (arg === '--cache' || arg.startsWith('--cache=')) {
      options.cache = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? options.cache;
      continue;
    }
    if (arg === '--manifest' || arg.startsWith('--manifest=')) {
      options.manifest = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }
    if (arg === '--mapping' || arg.startsWith('--mapping=')) {
      options.mapping = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }
    if (arg === '--report-dir' || arg.startsWith('--report-dir=')) {
      options.reportDir = arg.includes('=')
        ? arg.split('=').slice(1).join('=')
        : argv[++i] ?? options.reportDir;
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
    }
  }

  return options;
};

const pushRow = (
  buckets: Record<string, MediaReportRow[]>,
  status: string,
  row: MediaReportRow,
): void => {
  const key =
    status === 'SUCCESS' || status === 'OVERRIDE'
      ? 'success'
      : status === 'MISSING_SOURCE'
        ? 'missing-source'
        : status === 'AMBIGUOUS_SOURCE'
          ? 'ambiguous-source'
          : status === 'MALFORMED_URL'
            ? 'malformed-url'
            : status === 'UNSUPPORTED_MEDIA'
              ? 'unsupported-media'
              : status === 'SKIPPED_CACHED'
                ? 'skipped-cached'
                : 'failed-upload';
  (buckets[key] ??= []).push(row);
};

const mappingJsonPath = (outXlsxPath: string): string =>
  outXlsxPath.toLowerCase().endsWith('.xlsx')
    ? `${outXlsxPath.slice(0, -5)}.json`
    : `${outXlsxPath}.json`;

const loadExistingExternalIds = async (dataSource: DataSource): Promise<Set<string>> => {
  const existing = new Set<string>();
  const productRepo = dataSource.getRepository(ProductEntity);
  const variantRepo = dataSource.getRepository(ProductVariantEntity);

  const products = await productRepo
    .createQueryBuilder('p')
    .select(['p.externalProductId'])
    .where('p.externalProductId IS NOT NULL')
    .andWhere("TRIM(p.externalProductId) <> ''")
    .getMany();
  for (const product of products) {
    const key = normalizeLookupProductId(product.externalProductId);
    if (key) existing.add(key);
  }

  const variants = await variantRepo
    .createQueryBuilder('v')
    .select(['v.externalProductId'])
    .where('v.externalProductId IS NOT NULL')
    .andWhere("TRIM(v.externalProductId) <> ''")
    .getMany();
  for (const variant of variants) {
    const key = normalizeLookupProductId(variant.externalProductId);
    if (key) existing.add(key);
  }

  return existing;
};

const writeHarvestOutputs = async (
  outPath: string,
  byProductId: Map<string, string[]>,
  cache: Map<string, string>,
): Promise<Map<string, string[]>> => {
  const mapped = mapProductUrlsToGcsKeys(byProductId, cache);
  await writeHarvestedMappingWorkbook(outPath, mapped);
  await writeHarvestedMappingJson(mappingJsonPath(outPath), mapped);
  return mapped;
};

async function run(): Promise<void> {
  const startedAt = new Date();
  const options = parseCli(process.argv.slice(2));
  const filePath = absolutePath(options.file);
  const outPath = absolutePath(options.out);
  const cachePath = absolutePath(options.cache);
  const jsonOutPath = mappingJsonPath(outPath);
  const reportDir = createReportDir(absolutePath(options.reportDir));

  console.log(`[product:harvest-images] source=${filePath}`);
  console.log(`[product:harvest-images] out=${outPath}`);
  console.log(`[product:harvest-images] outJson=${jsonOutPath}`);
  console.log(`[product:harvest-images] cache=${cachePath}`);
  console.log(`[product:harvest-images] reportDir=${reportDir}`);
  console.log(
    `[product:harvest-images] apply=${options.apply} includeMatched=${options.includeMatched} concurrency=${options.concurrency}`,
  );
  console.log(
    `[product:harvest-images] download host rewrite: https://www.cureka.com → ${LEGACY_CUREKA_ORIGIN}`,
  );

  let manifest: ManifestIndex | null = null;
  let mapping: OverrideMapping | null = null;
  if (options.manifest) {
    manifest = await loadManifestIndex(absolutePath(options.manifest));
    console.log(
      `[product:harvest-images] manifest entries=${manifest.entryCount} basenames=${manifest.byBasename.size}`,
    );
  }
  if (options.mapping) {
    mapping = await loadOverrideMapping(absolutePath(options.mapping));
    console.log(`[product:harvest-images] overrides=${mapping.byOriginalUrl.size}`);
  }

  const imageLookup = await loadImageUrlsByProductId(filePath);
  if (!imageLookup.loaded || imageLookup.byProductId.size === 0) {
    throw new Error(`Could not load Images from sheet: ${filePath}`);
  }

  const app = await NestFactory.createApplicationContext(ProductImageHarvestCommandModule, {
    logger: ['error', 'warn', 'log'],
  });

  const buckets: Record<string, MediaReportRow[]> = {
    success: [],
    'missing-source': [],
    'ambiguous-source': [],
    'malformed-url': [],
    'unsupported-media': [],
    'failed-upload': [],
    'skipped-cached': [],
  };

  const summary: HarvestSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    durationMs: 0,
    sheetProductIds: imageLookup.byProductId.size,
    matchedInDb: 0,
    unmatchedProductIds: 0,
    uniqueUrls: 0,
    cached: 0,
    pending: 0,
    thisRun: 0,
    exactUrlSuccesses: 0,
    manifestFallbackSuccesses: 0,
    manualOverrideSuccesses: 0,
    ambiguousSources: 0,
    missingSources: 0,
    malformedUrls: 0,
    unsupportedMimeTypes: 0,
    uploadFailures: 0,
    skippedCached: 0,
    includeMatched: options.includeMatched,
    apply: options.apply,
  };

  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const existingExternalIds = await loadExistingExternalIds(dataSource);

    const unmatchedIds = new Set<string>();
    const matchedIds: string[] = [];
    for (const productId of imageLookup.byProductId.keys()) {
      if (existingExternalIds.has(productId)) {
        matchedIds.push(productId);
      } else {
        unmatchedIds.add(productId);
      }
    }

    summary.matchedInDb = matchedIds.length;
    summary.unmatchedProductIds = unmatchedIds.size;

    writeCsvReport(
      join(reportDir, 'skipped-already-in-db.csv'),
      matchedIds.map((id) =>
        rowNow({
          external_product_id: id,
          status: 'SKIPPED_ALREADY_IN_DB',
        }),
      ),
    );
    writeCsvReport(
      join(reportDir, 'unmatched-product-ids.csv'),
      [...unmatchedIds].map((id) =>
        rowNow({
          external_product_id: id,
          status: 'UNMATCHED_FOR_HARVEST',
        }),
      ),
    );

    const harvestByProductId = options.includeMatched
      ? imageLookup.byProductId
      : filterImageUrlsByProductIds(imageLookup.byProductId, unmatchedIds);

    console.log(
      `[product:harvest-images] sheetIds=${imageLookup.byProductId.size} matchedInDb=${matchedIds.length} unmatched=${unmatchedIds.size} harvestScopeIds=${harvestByProductId.size}`,
    );

    const uniqueUrls = collectUniqueImageUrls(harvestByProductId);
    const cache = await loadHarvestCache(cachePath);
    const pending = uniqueUrls.filter((url) => !cache.has(url));
    const toDownload = options.limit ? pending.slice(0, options.limit) : pending;

    summary.uniqueUrls = uniqueUrls.length;
    summary.cached = cache.size;
    summary.pending = pending.length;
    summary.thisRun = toDownload.length;
    summary.skippedCached = uniqueUrls.length - pending.length;

    for (const url of uniqueUrls) {
      if (cache.has(url)) {
        pushRow(
          buckets,
          'SKIPPED_CACHED',
          rowNow({
            original_url: url,
            status: 'SKIPPED_CACHED',
            gcs_key: cache.get(url),
          }),
        );
      }
    }

    console.log(
      `[product:harvest-images] uniqueUrls=${uniqueUrls.length} cachedHits=${summary.skippedCached} pending=${pending.length} thisRun=${toDownload.length}`,
    );

    if (!options.apply) {
      console.log(
        '[product:harvest-images] dry-run sample unmatched IDs:',
        JSON.stringify([...unmatchedIds].slice(0, 15), null, 2),
      );
      console.log(
        '[product:harvest-images] dry-run sample URLs:',
        JSON.stringify(toDownload.slice(0, 10), null, 2),
      );
      console.log('[product:harvest-images] dry-run complete — re-run with --apply');
    } else if (!toDownload.length) {
      const mapped = await writeHarvestOutputs(outPath, harvestByProductId, cache);
      const withKeys = [...mapped.values()].filter((keys) => keys.length > 0).length;
      console.log(
        `[product:harvest-images] nothing new to download — refreshed mapping productsWithKeys=${withKeys}/${mapped.size}`,
      );
    } else {
      const storage = app.get(StorageService);
      let sinceFlush = 0;
      let flushing = Promise.resolve();

      const flushCache = async (): Promise<void> => {
        const pendingFlush = flushing.then(() => saveHarvestCache(cachePath, cache));
        flushing = pendingFlush.then(
          () => undefined,
          () => undefined,
        );
        await pendingFlush;
      };

      await mapPool(toDownload, options.concurrency, async (url) => {
        const resolved = await resolveImageSource(url, {
          manifest,
          mapping,
          maxBytes: DEFAULT_MAX_IMAGE_BYTES,
        });

        const baseRow = rowNow({
          original_url: url,
          rewritten_url: resolved.rewrittenUrl,
          resolved_url: resolved.resolvedUrl,
          status: resolved.status,
          http_status: resolved.httpStatus ?? '',
          detected_mime: resolved.detectedMime,
          candidate_paths: resolved.candidatePaths.join(' | '),
          error_message: resolved.errorMessage,
        });

        if (resolved.status !== 'SUCCESS' && resolved.status !== 'OVERRIDE') {
          if (resolved.status === 'MISSING_SOURCE') summary.missingSources += 1;
          if (resolved.status === 'AMBIGUOUS_SOURCE') summary.ambiguousSources += 1;
          if (resolved.status === 'MALFORMED_URL') summary.malformedUrls += 1;
          if (resolved.status === 'UNSUPPORTED_MEDIA') summary.unsupportedMimeTypes += 1;
          if (resolved.status === 'HTTP_ERROR') summary.uploadFailures += 1;
          pushRow(buckets, resolved.status, baseRow);
          console.error(
            `[product:harvest-images] FAIL ${resolved.status}: ${resolved.errorMessage ?? url}`,
          );
          return;
        }

        if (resolved.status === 'OVERRIDE') summary.manualOverrideSuccesses += 1;
        else if (resolved.candidatePaths.length === 1) summary.manifestFallbackSuccesses += 1;
        else summary.exactUrlSuccesses += 1;

        try {
          const upload = await storage.uploadImage({
            stream: Readable.from(resolved.buffer!),
            mimetype: resolved.detectedMime || 'image/jpeg',
            originalFilename: resolved.filename || basenameFromUrl(url) || 'image.jpg',
            folder: UploadFolder.IMAGES,
            maxSizeOverride: DEFAULT_MAX_IMAGE_BYTES,
          });
          cache.set(url, upload.path);
          sinceFlush += 1;
          if (sinceFlush >= CACHE_FLUSH_EVERY) {
            sinceFlush = 0;
            await flushCache();
          }
          pushRow(buckets, resolved.status, { ...baseRow, gcs_key: upload.path });
          console.log(`[product:harvest-images] OK ${upload.path}`);
        } catch (error) {
          summary.uploadFailures += 1;
          pushRow(
            buckets,
            'FAILED_UPLOAD',
            rowNow({
              ...baseRow,
              status: 'FAILED_UPLOAD',
              error_message: error instanceof Error ? error.message : String(error),
            }),
          );
          console.error(
            `[product:harvest-images] FAIL upload ${url}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      });

      await flushCache();
      const mapped = await writeHarvestOutputs(outPath, harvestByProductId, cache);
      const withKeys = [...mapped.values()].filter((keys) => keys.length > 0).length;
      console.log(
        `[product:harvest-images] mappingProductsWithKeys=${withKeys}/${mapped.size} cacheSize=${cache.size}`,
      );
    }
  } finally {
    await app.close();
  }

  const finishedAt = new Date();
  summary.finishedAt = finishedAt.toISOString();
  summary.durationMs = finishedAt.getTime() - startedAt.getTime();

  writeCsvReport(join(reportDir, 'success.csv'), buckets.success);
  writeCsvReport(join(reportDir, 'missing-source.csv'), buckets['missing-source']);
  writeCsvReport(join(reportDir, 'ambiguous-source.csv'), buckets['ambiguous-source']);
  writeCsvReport(join(reportDir, 'malformed-url.csv'), buckets['malformed-url']);
  writeCsvReport(join(reportDir, 'unsupported-media.csv'), buckets['unsupported-media']);
  writeCsvReport(join(reportDir, 'failed-upload.csv'), buckets['failed-upload']);
  writeCsvReport(join(reportDir, 'skipped-cached.csv'), buckets['skipped-cached']);
  writeJsonReport(join(reportDir, 'summary.json'), summary);

  console.log('[product:harvest-images] summary:', JSON.stringify(summary, null, 2));
  console.log(`[product:harvest-images] reports written to ${reportDir}`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[product:harvest-images] failed:', error);
    process.exit(1);
  });
