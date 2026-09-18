/**
 * Backfill / repair product media from the WooCommerce export sheet.
 *
 * SAFE BY DEFAULT: dry-run; --apply required for writes; --only-missing never replaces.
 * See docs/PRODUCT_MEDIA_BACKFILL.md
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { In, DataSource } from 'typeorm';
import { Readable } from 'stream';
import { join } from 'path';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import {
  loadImageUrlsByProductId,
  normalizeLookupProductId,
  DEFAULT_WP_IMAGE_EXPORT_FILE,
} from '@modules/product/utils/bulk-upload-reference-lookup.util';
import { LEGACY_CUREKA_ORIGIN } from '@modules/product/utils/bulk-upload-image.util';
import {
  absolutePath,
  assertCheckpointFingerprints,
  basenameFromStorageKey,
  basenameFromUrl,
  BackfillSummary,
  chunk,
  createReportDir,
  DEFAULT_MAX_IMAGE_BYTES,
  fileSha256,
  loadCheckpoint,
  loadManifestIndex,
  loadOverrideMapping,
  mapPool,
  MediaReportRow,
  ManifestIndex,
  OverrideMapping,
  resolveImageSource,
  rewriteToLegacyOrigin,
  rowNow,
  saveCheckpointAtomic,
  writeCsvReport,
  writeJsonReport,
} from '@modules/product/utils/media-backfill';
import { ProductMediaBackfillCommandModule } from './product-media-backfill.command.module';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = DEFAULT_WP_IMAGE_EXPORT_FILE;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_REPORT_DIR = 'reports/product-media-backfill';

type Mode = 'only-bmp' | 'only-missing' | 'all-matched';

interface CliOptions {
  file: string;
  mode: Mode;
  apply: boolean;
  auditOnly: boolean;
  confirm: boolean;
  replace: boolean;
  limit?: number;
  concurrency: number;
  manifest?: string;
  mapping?: string;
  reportDir: string;
  checkpoint?: string;
  resume: boolean;
}

interface Target {
  productId: string;
  refId: string;
  externalId: string;
  urls: string[];
  urlsToAdd: string[];
  existingCommonCount: number;
}

const urlHasBmp = (urls: string[]): boolean =>
  urls.some((url) => /\.bmp(\?|#|$)/i.test(url.trim()));

const printUsage = (): void => {
  console.log(`
Product media backfill (WC sheet Images → external_product_id)

SAFE DEFAULT: dry-run; appends missing images only.

Examples:
  npm run product:backfill-media -- --audit-only --only-missing --manifest=docs/legacy-uploads-manifest.tsv.gz
  npm run product:backfill-media -- --only-missing --apply --manifest=docs/legacy-uploads-manifest.tsv.gz
  npm run product:backfill-media -- --resume --checkpoint=reports/.../checkpoint.json --apply --only-missing --manifest=...

Options:
  --file <path>          WC export xlsx
  --only-bmp             Append missing .bmp only (default mode)
  --only-missing         Products with no common media; fill gallery
  --all-matched          All matched products; append missing basenames
  --replace              DELETE existing common media (needs --confirm --apply)
  --apply                Persist downloads + DB rows
  --audit-only           Resolve/validate only — no GCS, no DB writes
  --manifest <path>      legacy-uploads-manifest.tsv[.gz]
  --mapping <path>       legacy-media-overrides.csv
  --report-dir <path>    Default ${DEFAULT_REPORT_DIR}
  --checkpoint <path>    Checkpoint JSON for resume
  --resume               Skip completed products in checkpoint
  --confirm              Required with --replace --apply
  --limit <n>            Max products
  --concurrency <n>      Parallel downloads (default ${DEFAULT_CONCURRENCY})
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_FILE,
    mode: 'only-bmp',
    apply: false,
    auditOnly: false,
    confirm: false,
    replace: false,
    concurrency: DEFAULT_CONCURRENCY,
    reportDir: DEFAULT_REPORT_DIR,
    resume: false,
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
    if (arg === '--audit-only') {
      options.auditOnly = true;
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
    if (arg === '--resume') {
      options.resume = true;
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
    if (arg === '--manifest' || arg.startsWith('--manifest=')) {
      options.manifest = arg.includes('=')
        ? arg.split('=').slice(1).join('=')
        : argv[++i];
      continue;
    }
    if (arg === '--mapping' || arg.startsWith('--mapping=')) {
      options.mapping = arg.includes('=')
        ? arg.split('=').slice(1).join('=')
        : argv[++i];
      continue;
    }
    if (arg === '--report-dir' || arg.startsWith('--report-dir=')) {
      options.reportDir = arg.includes('=')
        ? arg.split('=').slice(1).join('=')
        : argv[++i] ?? options.reportDir;
      continue;
    }
    if (arg === '--checkpoint' || arg.startsWith('--checkpoint=')) {
      options.checkpoint = arg.includes('=')
        ? arg.split('=').slice(1).join('=')
        : argv[++i];
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
              : status === 'FAILED_UPLOAD' || status === 'HTTP_ERROR'
                ? 'failed-upload'
                : status === 'SKIPPED_EXISTING'
                  ? 'skipped-existing'
                  : 'failed-upload';
  (buckets[key] ??= []).push(row);
};

async function run(): Promise<void> {
  const startedAt = new Date();
  const options = parseCli(process.argv.slice(2));

  if (options.replace && options.apply && !options.confirm) {
    throw new Error('--replace --apply requires --confirm');
  }
  if (options.auditOnly && options.apply) {
    throw new Error('--audit-only cannot be combined with --apply');
  }
  if (options.resume && !options.checkpoint) {
    throw new Error('--resume requires --checkpoint');
  }

  const filePath = absolutePath(options.file);
  const reportRoot = absolutePath(options.reportDir);
  const reportDir = createReportDir(reportRoot);

  console.log(`[product:backfill-media] file=${filePath}`);
  console.log(
    `[product:backfill-media] mode=${options.mode} replace=${options.replace} apply=${options.apply} auditOnly=${options.auditOnly} concurrency=${options.concurrency}`,
  );
  console.log(`[product:backfill-media] reportDir=${reportDir}`);
  console.log(
    `[product:backfill-media] download host rewrite: https://www.cureka.com → ${LEGACY_CUREKA_ORIGIN}`,
  );

  const spreadsheetFingerprint = fileSha256(filePath);
  let manifest: ManifestIndex | null = null;
  let mapping: OverrideMapping | null = null;

  if (options.manifest) {
    const manifestPath = absolutePath(options.manifest);
    console.log(`[product:backfill-media] loading manifest=${manifestPath}`);
    manifest = await loadManifestIndex(manifestPath);
    console.log(
      `[product:backfill-media] manifest entries=${manifest.entryCount} basenames=${manifest.byBasename.size}`,
    );
    if (manifest.entryCount === 0) {
      console.warn(
        '[product:backfill-media] WARNING: manifest loaded 0 usable paths — expected lines like `2024/10/file.jpg` or `wp-content/uploads/2024/10/file.jpg`. 404 recovery will not work.',
      );
    }
  }

  if (options.mapping) {
    const mappingPath = absolutePath(options.mapping);
    mapping = await loadOverrideMapping(mappingPath);
    console.log(
      `[product:backfill-media] overrides=${mapping.byOriginalUrl.size} invalid=${mapping.invalid.length}`,
    );
    if (mapping.invalid.length) {
      writeCsvReport(
        join(reportDir, 'invalid-mappings.csv'),
        mapping.invalid.map((row) =>
          rowNow({
            original_url: row.original_url,
            resolved_url: row.resolved_url,
            status: 'MALFORMED_URL',
            error_message: row.error,
          }),
        ),
      );
    }
  }

  const imageLookup = await loadImageUrlsByProductId(filePath);
  if (!imageLookup.loaded || imageLookup.byProductId.size === 0) {
    throw new Error(`Could not load Images from sheet: ${filePath}`);
  }
  console.log(`[product:backfill-media] sheet product IDs with images=${imageLookup.byProductId.size}`);

  let completedProductIds = new Set<string>();
  if (options.resume && options.checkpoint) {
    const cp = loadCheckpoint(absolutePath(options.checkpoint));
    if (!cp) throw new Error(`Could not load checkpoint: ${options.checkpoint}`);
    assertCheckpointFingerprints(cp, spreadsheetFingerprint, manifest?.fingerprint ?? null);
    completedProductIds = new Set(cp.completedProductIds);
    console.log(`[product:backfill-media] resume skip completed=${completedProductIds.size}`);
  }

  const app = await NestFactory.createApplicationContext(ProductMediaBackfillCommandModule, {
    logger: ['error', 'warn', 'log'],
  });

  const buckets: Record<string, MediaReportRow[]> = {
    success: [],
    'missing-source': [],
    'ambiguous-source': [],
    'malformed-url': [],
    'unsupported-media': [],
    'failed-upload': [],
    'skipped-existing': [],
    'unmatched-products': [],
  };

  const summary: BackfillSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    durationMs: 0,
    uniqueExternalIds: imageLookup.byProductId.size,
    databaseMatches: 0,
    unmatchedProducts: 0,
    eligibleTargets: 0,
    exactUrlSuccesses: 0,
    manifestFallbackSuccesses: 0,
    manualOverrideSuccesses: 0,
    ambiguousSources: 0,
    missingSources: 0,
    malformedUrls: 0,
    unsupportedMimeTypes: 0,
    uploadFailures: 0,
    databaseUpdates: 0,
    skippedExisting: 0,
    httpErrors: 0,
    mode: options.mode,
    apply: options.apply,
    auditOnly: options.auditOnly,
  };

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
      .select(['v.id', 'v.productId', 'v.externalProductId', 'v.sku'])
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

    summary.databaseMatches = productsByExternalId.size;
    console.log(`[product:backfill-media] DB matches by external_product_id=${productsByExternalId.size}`);

    const matchedProductIds = [...new Set([...productsByExternalId.values()].map((p) => p.id))];
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
    let skippedFilter = 0;

    for (const [externalId, sheetUrls] of imageLookup.byProductId) {
      const urls = sheetUrls.map(rewriteToLegacyOrigin);
      const product = productsByExternalId.get(externalId);
      if (!product) {
        summary.unmatchedProducts += 1;
        buckets['unmatched-products'].push(
          rowNow({
            external_product_id: externalId,
            original_url: sheetUrls[0] ?? '',
            status: 'MISSING_SOURCE',
            error_message: 'No DB product/variant with this external_product_id',
          }),
        );
        continue;
      }

      if (completedProductIds.has(product.id)) {
        summary.skippedExisting += 1;
        continue;
      }

      const existing = existingMediaByProduct.get(product.id) ?? [];
      const existingCommonCount = existing.length;
      const existingBasenames = new Set(
        existing.map((m) => basenameFromStorageKey(m.url?.key)).filter(Boolean),
      );

      if (options.mode === 'only-bmp' && !urlHasBmp(urls)) {
        skippedFilter += 1;
        continue;
      }
      if (options.mode === 'only-missing' && existingCommonCount > 0) {
        skippedFilter += 1;
        summary.skippedExisting += 1;
        continue;
      }

      let urlsToAdd: string[];
      if (options.replace) {
        urlsToAdd = urls;
      } else if (options.mode === 'only-bmp') {
        urlsToAdd = urls.filter((url) => {
          if (!/\.bmp(\?|#|$)/i.test(url)) return false;
          const base = basenameFromUrl(url).toLowerCase();
          return Boolean(base) && !existingBasenames.has(base);
        });
      } else if (options.mode === 'only-missing') {
        urlsToAdd = urls;
      } else {
        urlsToAdd = urls.filter((url) => {
          const base = basenameFromUrl(url).toLowerCase();
          return Boolean(base) && !existingBasenames.has(base);
        });
      }

      if (!urlsToAdd.length) {
        summary.skippedExisting += 1;
        buckets['skipped-existing'].push(
          rowNow({
            external_product_id: externalId,
            product_ref_id: product.refId,
            original_url: urls[0] ?? '',
            status: 'SKIPPED_EXISTING',
            error_message: 'All sheet basenames already present',
          }),
        );
        continue;
      }

      const existingTarget = targets.find((t) => t.productId === product.id);
      if (existingTarget) {
        const seen = new Set(existingTarget.urlsToAdd.map((u) => basenameFromUrl(u).toLowerCase()));
        for (const url of urlsToAdd) {
          const base = basenameFromUrl(url).toLowerCase();
          if (base && !seen.has(base)) {
            existingTarget.urlsToAdd.push(url);
            seen.add(base);
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
    summary.eligibleTargets = limited.length;
    console.log(
      `[product:backfill-media] targets=${limited.length} (unmatched=${summary.unmatchedProducts}, skippedFilter=${skippedFilter}, skippedExisting=${summary.skippedExisting})`,
    );

    if (!limited.length) {
      console.log('[product:backfill-media] nothing to do');
    } else if (!options.apply && !options.auditOnly) {
      console.log(
        '[product:backfill-media] dry-run sample:',
        JSON.stringify(
          limited.slice(0, 15).map((t) => ({
            refId: t.refId,
            externalId: t.externalId,
            willAdd: t.urlsToAdd.length,
          })),
          null,
          2,
        ),
      );
      console.log('[product:backfill-media] dry-run — re-run with --apply or --audit-only');
    } else {
      const touchedRefIds: string[] = [];
      const completedIds = [...completedProductIds];

      for (const target of limited) {
        const existing = existingMediaByProduct.get(target.productId) ?? [];
        const maxSort = existing.reduce((max, m) => Math.max(max, m.sortOrder ?? 0), -1);
        const uploaded: Array<{ path: string; sortOrder: number }> = [];

        try {
          const resolvedList = await mapPool(
            target.urlsToAdd,
            options.concurrency,
            async (url) => {
              const resolved = await resolveImageSource(url, {
                manifest,
                mapping,
                maxBytes: DEFAULT_MAX_IMAGE_BYTES,
                validateContent: true,
              });
              return { url, resolved };
            },
          );

          for (const { url, resolved } of resolvedList) {
            const baseRow = rowNow({
              external_product_id: target.externalId,
              product_ref_id: target.refId,
              original_url: url,
              rewritten_url: resolved.rewrittenUrl,
              resolved_url: resolved.resolvedUrl,
              status: resolved.status,
              http_status: resolved.httpStatus ?? '',
              detected_mime: resolved.detectedMime,
              candidate_paths: resolved.candidatePaths.join(' | '),
              error_message: resolved.errorMessage,
            });

            if (resolved.status === 'SUCCESS' || resolved.status === 'OVERRIDE') {
              if (resolved.status === 'OVERRIDE') summary.manualOverrideSuccesses += 1;
              else if (resolved.candidatePaths.length === 1) summary.manifestFallbackSuccesses += 1;
              else summary.exactUrlSuccesses += 1;

              if (options.auditOnly) {
                pushRow(buckets, resolved.status, baseRow);
                continue;
              }

              try {
                const upload = await storage.uploadImage({
                  stream: Readable.from(resolved.buffer!),
                  mimetype: resolved.detectedMime || 'image/jpeg',
                  originalFilename: resolved.filename || basenameFromUrl(url) || 'image.jpg',
                  folder: UploadFolder.IMAGES,
                  maxSizeOverride: DEFAULT_MAX_IMAGE_BYTES,
                });
                uploaded.push({ path: upload.path, sortOrder: uploaded.length });
                pushRow(buckets, 'SUCCESS', {
                  ...baseRow,
                  status: resolved.status,
                  gcs_key: upload.path,
                });
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
              }
            } else {
              if (resolved.status === 'MISSING_SOURCE') summary.missingSources += 1;
              if (resolved.status === 'AMBIGUOUS_SOURCE') summary.ambiguousSources += 1;
              if (resolved.status === 'MALFORMED_URL') summary.malformedUrls += 1;
              if (resolved.status === 'UNSUPPORTED_MEDIA') summary.unsupportedMimeTypes += 1;
              if (resolved.status === 'HTTP_ERROR') summary.httpErrors += 1;
              pushRow(buckets, resolved.status, baseRow);
              console.error(
                `[product:backfill-media] FAIL ${target.refId} ${resolved.status}: ${resolved.errorMessage ?? url}`,
              );
            }
          }

          if (!options.auditOnly && uploaded.length) {
            try {
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
                    uploaded.map((item, index) =>
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
                  await repo.save(
                    uploaded.map((item, index) =>
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
              summary.databaseUpdates += 1;
              touchedRefIds.push(target.refId);
              console.log(
                `[product:backfill-media] OK ${target.refId} externalId=${target.externalId} appended=${uploaded.length}`,
              );
            } catch (error) {
              summary.uploadFailures += 1;
              for (const item of uploaded) {
                try {
                  await storage.delete(item.path);
                } catch {
                  /* orphan recorded below */
                }
                pushRow(
                  buckets,
                  'FAILED_UPLOAD',
                  rowNow({
                    external_product_id: target.externalId,
                    product_ref_id: target.refId,
                    original_url: '',
                    status: 'FAILED_UPLOAD',
                    gcs_key: item.path,
                    error_message: `DB write failed after upload; attempted GCS cleanup: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  }),
                );
              }
            }
          }

          completedIds.push(target.productId);
          if (options.checkpoint) {
            saveCheckpointAtomic(absolutePath(options.checkpoint), {
              version: 1,
              spreadsheetFingerprint,
              manifestFingerprint: manifest?.fingerprint ?? null,
              completedProductIds: completedIds,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          summary.uploadFailures += 1;
          console.error(
            `[product:backfill-media] FAIL ${target.refId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (touchedRefIds.length) {
        const cache = await invalidateProductCache(
          touchedRefIds.map((refId) => ({ refId })),
          false,
        );
        console.log(
          `[product:backfill-media] cacheKeysDeleted=${cache.keysDeleted} redis=${cache.connected}`,
        );
      }
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
  writeCsvReport(join(reportDir, 'unmatched-products.csv'), buckets['unmatched-products']);
  writeCsvReport(join(reportDir, 'failed-upload.csv'), buckets['failed-upload']);
  writeCsvReport(join(reportDir, 'skipped-existing.csv'), buckets['skipped-existing']);
  writeJsonReport(join(reportDir, 'summary.json'), summary);

  console.log('[product:backfill-media] summary:', JSON.stringify(summary, null, 2));
  console.log(`[product:backfill-media] reports written to ${reportDir}`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[product:backfill-media] failed:', error);
    process.exit(1);
  });
