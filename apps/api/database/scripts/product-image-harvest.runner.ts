/**
 * Harvest WooCommerce export images into GCS without requiring products in DB.
 *
 * Reads sheet ID + Images (www.cureka.com URLs), downloads from
 * https://legacy.cureka.com, uploads to GCS, and writes
 * docs/wp-product-image-gcs-map.xlsx (ID → images/<uuid>.jpg).
 * Bulk upload uses that map for Product ID auto-attach.
 *
 * Resume: docs/wp-image-harvest-cache.json stores URL → GCS key.
 *
 * Usage:
 *   npm run product:harvest-images
 *   npm run product:harvest-images -- --limit=20
 *   npm run product:harvest-images -- --apply
 *   npm run product:harvest-images -- --limit=20 --apply
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { isAbsolute, resolve } from 'path';
import { Readable } from 'stream';
import { AppModule } from '../../app.module';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import {
  DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
  DEFAULT_IMAGE_HARVEST_CACHE_FILE,
  DEFAULT_WP_IMAGE_EXPORT_FILE,
  loadImageUrlsByProductId,
} from '@modules/product/utils/bulk-upload-reference-lookup.util';
import {
  LEGACY_CUREKA_ORIGIN,
  toLegacyCurekaImageUrl,
} from '@modules/product/utils/bulk-upload-image.util';
import {
  collectUniqueImageUrls,
  loadHarvestCache,
  mapProductUrlsToGcsKeys,
  saveHarvestCache,
  writeHarvestedMappingWorkbook,
} from '@modules/product/utils/wp-image-harvest.util';

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const CACHE_FLUSH_EVERY = 25;

interface CliOptions {
  file: string;
  out: string;
  cache: string;
  apply: boolean;
  limit?: number;
  concurrency: number;
}

const absolutePath = (path: string): string =>
  isAbsolute(path) ? path : resolve(process.cwd(), path);

const basenameFromUrl = (url: string): string => {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const name = clean.split('/').pop() ?? '';
    return decodeURIComponent(name).trim();
  } catch {
    return '';
  }
};

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

const printUsage = (): void => {
  console.log(`
Harvest WC export images → GCS (no DB product required)

Writes Product ID → GCS key mapping for bulk-upload auto-attach.

Examples:
  npm run product:harvest-images
  npm run product:harvest-images -- --limit=20 --apply
  npm run product:harvest-images -- --apply

Downloads rewrite https://www.cureka.com → ${LEGACY_CUREKA_ORIGIN}

Options:
  --file <path>        WC export xlsx (ID + Images http URLs)
  --out <path>         Mapping xlsx (ID + Images GCS keys)
  --cache <path>       Resume cache JSON (URL → GCS key)
  --apply              Download + upload + write mapping
  --limit <n>          Max new unique URLs to download
  --concurrency <n>    Parallel downloads (default ${DEFAULT_CONCURRENCY})
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_WP_IMAGE_EXPORT_FILE,
    out: DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
    cache: DEFAULT_IMAGE_HARVEST_CACHE_FILE,
    apply: false,
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

  const runners = Array.from({ length: Math.min(concurrency, items.length || 1) }, () => run());
  await Promise.all(runners);
  return results;
};

const downloadToGcs = async (storage: StorageService, sourceUrl: string): Promise<string> => {
  const downloadUrl = toLegacyCurekaImageUrl(sourceUrl);
  const response = await fetch(downloadUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CurekaImageHarvest/1.0; +https://www.cureka.com)',
      Accept: 'image/*,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${downloadUrl}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const originalFilename = basenameFromUrl(downloadUrl) || 'image.jpg';
  const mimetype = resolveMime(originalFilename, response.headers.get('content-type'));
  const upload = await storage.uploadImage({
    stream: Readable.from(buffer),
    mimetype,
    originalFilename,
    folder: UploadFolder.IMAGES,
    maxSizeOverride: DEFAULT_MAX_IMAGE_BYTES,
  });
  return upload.path;
};

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const filePath = absolutePath(options.file);
  const outPath = absolutePath(options.out);
  const cachePath = absolutePath(options.cache);

  console.log(`[product:harvest-images] source=${filePath}`);
  console.log(`[product:harvest-images] out=${outPath}`);
  console.log(`[product:harvest-images] cache=${cachePath}`);
  console.log(
    `[product:harvest-images] apply=${options.apply} concurrency=${options.concurrency}${options.limit ? ` limit=${options.limit}` : ''}`,
  );
  console.log(`[product:harvest-images] download host rewrite: https://www.cureka.com → ${LEGACY_CUREKA_ORIGIN}`);

  const imageLookup = await loadImageUrlsByProductId(filePath);
  if (!imageLookup.loaded || imageLookup.byProductId.size === 0) {
    throw new Error(`Could not load Images from sheet: ${filePath}`);
  }

  const uniqueUrls = collectUniqueImageUrls(imageLookup.byProductId);
  const cache = await loadHarvestCache(cachePath);
  const pending = uniqueUrls.filter((url) => !cache.has(url));
  const toDownload = options.limit ? pending.slice(0, options.limit) : pending;

  console.log(
    `[product:harvest-images] sheetProductIds=${imageLookup.byProductId.size} uniqueUrls=${uniqueUrls.length} cached=${cache.size} pending=${pending.length} thisRun=${toDownload.length}`,
  );

  if (!options.apply) {
    console.log('[product:harvest-images] dry-run sample:', JSON.stringify(toDownload.slice(0, 10), null, 2));
    console.log('[product:harvest-images] dry-run complete — no GCS writes; re-run with --apply to download');
    return;
  }

  if (!toDownload.length) {
    const mapped = mapProductUrlsToGcsKeys(imageLookup.byProductId, cache);
    await writeHarvestedMappingWorkbook(outPath, mapped);
    const withKeys = [...mapped.values()].filter((keys) => keys.length > 0).length;
    console.log(
      `[product:harvest-images] nothing new to download — refreshed mapping productsWithKeys=${withKeys}/${mapped.size}`,
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const storage = app.get(StorageService);
    let ok = 0;
    let failed = 0;
    let sinceFlush = 0;
    let flushing = Promise.resolve();
    const failures: Array<{ url: string; error: string }> = [];

    const flushCache = async (): Promise<void> => {
      const pending = flushing.then(() => saveHarvestCache(cachePath, cache));
      flushing = pending.then(
        () => undefined,
        () => undefined,
      );
      await pending;
    };

    await mapPool(toDownload, options.concurrency, async (url) => {
      try {
        const path = await downloadToGcs(storage, url);
        cache.set(url, path);
        ok += 1;
        sinceFlush += 1;
        if (sinceFlush >= CACHE_FLUSH_EVERY) {
          sinceFlush = 0;
          await flushCache();
        }
        console.log(`[product:harvest-images] OK ${ok}/${toDownload.length} ${path}`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ url, error: message });
        console.error(`[product:harvest-images] FAIL ${url}: ${message}`);
      }
    });

    await flushCache();
    const mapped = mapProductUrlsToGcsKeys(imageLookup.byProductId, cache);
    await writeHarvestedMappingWorkbook(outPath, mapped);
    const withKeys = [...mapped.values()].filter((keys) => keys.length > 0).length;

    console.log(
      `[product:harvest-images] done ok=${ok} failed=${failed} cacheSize=${cache.size} mappingProductsWithKeys=${withKeys}/${mapped.size}`,
    );
    if (failures.length) {
      console.log('[product:harvest-images] failures:', JSON.stringify(failures.slice(0, 30), null, 2));
    }
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[product:harvest-images] failed:', error);
    process.exit(1);
  });
