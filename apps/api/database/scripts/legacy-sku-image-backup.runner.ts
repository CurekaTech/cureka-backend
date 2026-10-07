/**
 * Back up legacy images for specific SKUs only.
 *
 * Finds each SKU on the legacy image sheet and stores the Product ID, SKU,
 * and comma-separated GCS image keys in the files bulk upload already reads.
 * Does not check the database and does not change products.
 *
 * Dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:backup-legacy-skus -- --sku=BEB/ACN/05489,COM/COM/16483
 *   npm run product:backup-legacy-skus -- --apply --sku=BEB/ACN/05489,COM/COM/16483
 */
import 'reflect-metadata';
import { copyFile, access } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import { Readable } from 'stream';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { toLegacyCurekaImageUrl } from '@modules/product/utils/bulk-upload-image.util';
import {
  DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
  DEFAULT_IMAGE_HARVEST_CACHE_FILE,
  loadHarvestedImageLookup,
  normalizeLookupSku,
} from '@modules/product/utils/bulk-upload-reference-lookup.util';
import {
  decideCachedImageReuse,
  findHarvestedGcsKey,
  forgetHarvestCacheKey,
  loadIdSkuImageSheet,
  mergeHarvestedImageRows,
  rememberHarvestCacheKey,
  validateBackedUpImageBuffer,
  type IdSkuImageRow,
} from '@modules/product/utils/legacy-image-reconcile.util';
import {
  loadHarvestCache,
  saveHarvestCache,
  writeHarvestedImageRows,
} from '@modules/product/utils/wp-image-harvest.util';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/legacy-image-urls-10-09.xlsx';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const CONCURRENCY = 3;

interface CliOptions {
  file: string;
  cache: string;
  out: string;
  apply: boolean;
  skus: Set<string>;
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
Back up legacy images for the SKUs you pass. Does not read or change the database.

  npm run product:backup-legacy-skus -- --sku=BEB/ACN/05489,COM/COM/16483
  npm run product:backup-legacy-skus -- --apply --sku=BEB/ACN/05489,COM/COM/16483

Options:
  --sku <list>   Comma-separated SKUs. Required.
  --file <path>  Legacy image workbook (default: ${DEFAULT_FILE})
  --cache <path> Harvest cache JSON (default: ${DEFAULT_IMAGE_HARVEST_CACHE_FILE})
  --out <path>   GCS map workbook (default: ${DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE})
  --apply        Download missing images and merge them into the cache and map
  --dry-run      Preview only. This is the default.
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_FILE,
    cache: DEFAULT_IMAGE_HARVEST_CACHE_FILE,
    out: DEFAULT_HARVESTED_IMAGE_LOOKUP_FILE,
    apply: false,
    skus: new Set<string>(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const valueOf = (): string =>
      arg.includes('=') ? arg.split('=').slice(1).join('=') : (argv[++index] ?? '');
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--file' || arg.startsWith('--file=')) options.file = valueOf();
    else if (arg === '--cache' || arg.startsWith('--cache=')) options.cache = valueOf();
    else if (arg === '--out' || arg.startsWith('--out=')) options.out = valueOf();
    else if (arg === '--sku' || arg.startsWith('--sku=')) {
      for (const part of valueOf().split(',')) {
        const sku = normalizeLookupSku(part);
        if (sku) options.skus.add(sku);
      }
    }
  }
  if (argv.includes('--dry-run')) options.apply = false;
  return options;
};

const keysForRow = (row: IdSkuImageRow, byUrl: Map<string, string>): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const url of row.imageUrls) {
    const key = byUrl.get(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
};

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  if (options.skus.size === 0) {
    printUsage();
    throw new Error('Pass at least one SKU with --sku');
  }

  const sheetRows = await loadIdSkuImageSheet(absolutePath(options.file), { requireImages: true });
  const found = new Set<string>();
  const selected = sheetRows.filter((row) => {
    const sku = normalizeLookupSku(row.sku);
    if (!options.skus.has(sku)) return false;
    found.add(sku);
    return true;
  });
  const notOnSheet = [...options.skus].filter((sku) => !found.has(sku));

  console.log(`[product:backup-legacy-skus] requested=${options.skus.size} found=${selected.length}`);
  if (notOnSheet.length) {
    console.log(`[product:backup-legacy-skus] SKUs not on the legacy sheet: ${notOnSheet.join(', ')}`);
  }
  for (const row of selected) {
    console.log(
      `[product:backup-legacy-skus] sku=${row.sku.trim()} productId=${row.productId.trim()} images=${row.imageUrls.length}`,
    );
  }
  if (!selected.length) {
    throw new Error('None of the requested SKUs are on the legacy image sheet');
  }
  if (!options.apply) {
    console.log('[product:backup-legacy-skus] dry-run complete — re-run with --apply to write the cache and map');
    return;
  }

  const cachePath = absolutePath(options.cache);
  const outPath = absolutePath(options.out);
  const cacheExists = await fileExists(cachePath);
  const cache = cacheExists ? await loadHarvestCache(cachePath) : new Map<string, string>();
  const existingLookup = await loadHarvestedImageLookup(outPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (cacheExists) await copyFile(cachePath, `${cachePath}.bak-${stamp}`);
  if (await fileExists(outPath)) await copyFile(outPath, `${outPath}.bak-${stamp}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const storage = app.get(StorageService);
    const byUrl = new Map<string, string>();
    const invalidated = new Set<string>();
    const failures: string[] = [];
    const validatedKeys = new Map<string, boolean>();

    const inspectKey = async (key: string): Promise<{ exists: boolean; valid: boolean }> => {
      const cached = validatedKeys.get(key);
      if (cached !== undefined) return { exists: true, valid: cached };
      let exists = false;
      let valid = false;
      try {
        exists = await storage.exists(key);
        if (exists) {
          const buffer = await storage.readObjectBuffer(key, MAX_IMAGE_BYTES);
          valid = validateBackedUpImageBuffer(buffer, MAX_IMAGE_BYTES).ok;
        }
      } catch {
        exists = false;
        valid = false;
      }
      if (exists) validatedKeys.set(key, valid);
      return { exists, valid };
    };

    const urls: string[] = [];
    const seenUrls = new Set<string>();
    for (const row of selected) {
      for (const url of row.imageUrls) {
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        urls.push(url);
      }
    }

    const pending: string[] = [];
    for (const url of urls) {
      const cachedKey = findHarvestedGcsKey(cache, url);
      const inspected = cachedKey ? await inspectKey(cachedKey) : { exists: false, valid: false };
      const decision = decideCachedImageReuse({
        cachedKey,
        objectExists: inspected.exists,
        validationOk: inspected.valid,
      });
      if (decision.action === 'reuse') {
        byUrl.set(url, decision.key);
        continue;
      }
      if (cachedKey) {
        invalidated.add(cachedKey);
        forgetHarvestCacheKey(cache, cachedKey);
      }
      pending.push(url);
    }

    console.log(
      `[product:backup-legacy-skus] urls=${urls.length} reused=${byUrl.size} toDownload=${pending.length}`,
    );

    let next = 0;
    let downloaded = 0;
    const worker = async (): Promise<void> => {
      while (next < pending.length) {
        const url = pending[next];
        next += 1;
        if (!url) continue;
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
          const validation = validateBackedUpImageBuffer(buffer, MAX_IMAGE_BYTES);
          if (!validation.ok) throw new Error(validation.error ?? 'Invalid image response');
          const upload = await storage.uploadImage({
            stream: Readable.from(buffer),
            mimetype: validation.mime ?? 'image/jpeg',
            originalFilename: basenameFromUrl(downloadUrl) || 'image.jpg',
            folder: UploadFolder.IMAGES,
            maxSizeOverride: MAX_IMAGE_BYTES,
          });
          rememberHarvestCacheKey(cache, url, upload.path);
          byUrl.set(url, upload.path);
          downloaded += 1;
          console.log(`[product:backup-legacy-skus] OK ${downloaded}/${pending.length} ${upload.path}`);
        } catch (error) {
          const reason = describeError(error);
          failures.push(`${url}: ${reason}`);
          console.error(`[product:backup-legacy-skus] FAIL ${url}: ${reason}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length || 1) }, () => worker()));

    const incoming = selected.flatMap((row) => {
      const keys = keysForRow(row, byUrl);
      if (!keys.length) return [];
      return [{ productId: row.productId.trim(), sku: row.sku.trim(), keys }];
    });
    const merged = mergeHarvestedImageRows(existingLookup.rows, incoming, invalidated);
    await saveHarvestCache(cachePath, cache);
    await writeHarvestedImageRows(outPath, merged);

    console.log(
      `[product:backup-legacy-skus] wrote cache=${cachePath} map=${outPath} rows=${incoming.length} downloaded=${downloaded} failures=${failures.length}`,
    );
    if (failures.length) {
      throw new Error(`${failures.length} image download(s) failed`);
    }
  } finally {
    await app.close();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
