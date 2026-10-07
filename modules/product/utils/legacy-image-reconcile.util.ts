import { access } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import * as ExcelJS from 'exceljs';
import { detectRasterMagic, looksLikePdf, looksLikeSvg } from '@modules/image-pipeline/utils/image-bytes.util';
import { toLegacyCurekaImageUrl } from './bulk-upload-image.util';
import {
  normalizeLookupProductId,
  normalizeLookupSku,
} from './bulk-upload-reference-lookup.util';

export interface HarvestMapRow {
  productId: string;
  sku: string;
  keys: string[];
}

export interface LegacyIdentity {
  productId: string;
  sku: string;
}

export interface VariantMatchCandidate {
  id: string;
  sku: string;
  externalProductId: string | null;
  productExternalProductId: string | null;
  productId: string;
  productRefId: string;
  productSlug: string | null;
}

export type LegacyMatchKind =
  | 'sku_and_product_id'
  | 'sku_only'
  | 'product_id_only'
  | 'sku_match_product_id_mismatch'
  | 'product_id_match_sku_mismatch'
  | 'duplicate_sku'
  | 'duplicate_product_id'
  | 'db_duplicate_sku'
  | 'db_duplicate_product_id'
  | 'multiple_legacy_rows'
  | 'not_in_db';

export interface ClassifiedLegacyMatch {
  kind: LegacyMatchKind;
  reason: string;
  updateAllowed: boolean;
  variant: VariantMatchCandidate | null;
}

export type CachedImageReuse =
  | { action: 'reuse'; key: string }
  | { action: 'redownload'; reason: string };

export interface MissingLegacyMatch {
  status: 'found' | 'none' | 'conflict';
  reason: string;
}

const STORAGE_KEY_RE = /^(images|videos)\//i;

export interface ImageBufferCheck {
  ok: boolean;
  mime?: string;
  error?: string;
}

/** Accept a non-empty raster image. Reject HTML error pages, PDF, and SVG. */
export const validateBackedUpImageBuffer = (buffer: Buffer, maxBytes: number): ImageBufferCheck => {
  if (!buffer.length) return { ok: false, error: 'Empty response body' };
  if (buffer.length > maxBytes) return { ok: false, error: `Response exceeds max size ${maxBytes} bytes` };

  const head = buffer.subarray(0, Math.min(256, buffer.length)).toString('utf8').trim().toLowerCase();
  if (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<head') ||
    head.includes('<title>404')
  ) {
    return { ok: false, error: 'HTML/error page returned with image response', mime: 'text/html' };
  }
  if (looksLikeSvg(buffer)) return { ok: false, error: 'SVG is not a supported product image', mime: 'image/svg+xml' };
  if (looksLikePdf(buffer)) return { ok: false, error: 'PDF is not a supported product image', mime: 'application/pdf' };

  const mime = detectRasterMagic(buffer);
  if (!mime) return { ok: false, error: 'Unrecognized or corrupt image content' };
  return { ok: true, mime };
};

export const parseLegacyImageList = (raw: string | null | undefined): string[] => {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const part of String(raw ?? '').split(',')) {
    const url = part.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
};

export const sameImageKeyList = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((key, index) => key === right[index]);

export const effectiveVariantProductId = (variant: VariantMatchCandidate): string => {
  const own = normalizeLookupProductId(variant.externalProductId);
  if (own) return own;
  return normalizeLookupProductId(variant.productExternalProductId);
};

const normalizedIdentity = (row: LegacyIdentity): LegacyIdentity => ({
  productId: normalizeLookupProductId(row.productId),
  sku: normalizeLookupSku(row.sku),
});

const countValues = (values: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
};

const groupVariants = (
  variants: VariantMatchCandidate[],
  keyOf: (variant: VariantMatchCandidate) => string,
): Map<string, VariantMatchCandidate[]> => {
  const grouped = new Map<string, VariantMatchCandidate[]>();
  for (const variant of variants) {
    const key = keyOf(variant);
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(variant);
    grouped.set(key, list);
  }
  return grouped;
};

/**
 * Classify each legacy row against DB variants.
 * A simple product is matched through its single default variant. When that
 * variant has no Product ID, the parent product Product ID is used.
 */
export const classifyLegacyMatches = (
  records: LegacyIdentity[],
  variants: VariantMatchCandidate[],
): ClassifiedLegacyMatch[] => {
  const identities = records.map(normalizedIdentity);
  const normalizedVariants = variants.map((variant) => ({
    ...variant,
    sku: normalizeLookupSku(variant.sku),
  }));
  const sheetSkuCounts = countValues(identities.map((row) => row.sku));
  const sheetIdCounts = countValues(identities.map((row) => row.productId));
  const bySku = groupVariants(normalizedVariants, (variant) => variant.sku);
  const byProductId = groupVariants(normalizedVariants, effectiveVariantProductId);

  const results: ClassifiedLegacyMatch[] = identities.map((row) => {
    if (row.sku && (sheetSkuCounts.get(row.sku) ?? 0) > 1) {
      return {
        kind: 'duplicate_sku',
        reason: 'Duplicate SKU in the legacy sheet',
        updateAllowed: false,
        variant: null,
      };
    }
    if (row.productId && (sheetIdCounts.get(row.productId) ?? 0) > 1) {
      return {
        kind: 'duplicate_product_id',
        reason: 'Duplicate Product ID in the legacy sheet',
        updateAllowed: false,
        variant: null,
      };
    }
    if (row.sku && (bySku.get(row.sku)?.length ?? 0) > 1) {
      return {
        kind: 'db_duplicate_sku',
        reason: 'More than one DB variant has this SKU',
        updateAllowed: false,
        variant: null,
      };
    }
    if (row.productId && (byProductId.get(row.productId)?.length ?? 0) > 1) {
      return {
        kind: 'db_duplicate_product_id',
        reason: 'More than one DB variant has this Product ID',
        updateAllowed: false,
        variant: null,
      };
    }

    const skuHits = row.sku ? (bySku.get(row.sku) ?? []) : [];
    const idHits = row.productId ? (byProductId.get(row.productId) ?? []) : [];

    if (row.sku && row.productId) {
      const both = skuHits.filter((variant) => effectiveVariantProductId(variant) === row.productId);
      if (both.length === 1) {
        return {
          kind: 'sku_and_product_id',
          reason: 'SKU and Product ID match the same variant',
          updateAllowed: true,
          variant: both[0] ?? null,
        };
      }
      if (skuHits.length === 1) {
        return {
          kind: 'sku_match_product_id_mismatch',
          reason: 'SKU matches a variant whose Product ID differs',
          updateAllowed: false,
          variant: null,
        };
      }
      if (idHits.length === 1) {
        return {
          kind: 'product_id_match_sku_mismatch',
          reason: 'Product ID matches a variant whose SKU differs',
          updateAllowed: false,
          variant: null,
        };
      }
      return {
        kind: 'not_in_db',
        reason: 'SKU and Product ID were not found',
        updateAllowed: false,
        variant: null,
      };
    }

    if (row.sku) {
      if (skuHits.length === 1) {
        return {
          kind: 'sku_only',
          reason: 'SKU matches a variant',
          updateAllowed: true,
          variant: skuHits[0] ?? null,
        };
      }
      return {
        kind: 'not_in_db',
        reason: 'SKU was not found',
        updateAllowed: false,
        variant: null,
      };
    }

    if (row.productId) {
      if (idHits.length === 1) {
        return {
          kind: 'product_id_only',
          reason: 'Product ID matches a variant',
          updateAllowed: true,
          variant: idHits[0] ?? null,
        };
      }
      return {
        kind: 'not_in_db',
        reason: 'Product ID was not found',
        updateAllowed: false,
        variant: null,
      };
    }

    return {
      kind: 'not_in_db',
      reason: 'SKU and Product ID are empty',
      updateAllowed: false,
      variant: null,
    };
  });

  const hitsByVariant = new Map<string, number[]>();
  results.forEach((result, index) => {
    if (!result.updateAllowed || !result.variant) return;
    const list = hitsByVariant.get(result.variant.id) ?? [];
    list.push(index);
    hitsByVariant.set(result.variant.id, list);
  });
  for (const indexes of hitsByVariant.values()) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      results[index] = {
        kind: 'multiple_legacy_rows',
        reason: 'Multiple legacy records match the same DB variant',
        updateAllowed: false,
        variant: null,
      };
    }
  }

  return results;
};

export const indexIdentities = (
  records: LegacyIdentity[],
): { bySku: Map<string, number[]>; byProductId: Map<string, number[]> } => {
  const bySku = new Map<string, number[]>();
  const byProductId = new Map<string, number[]>();
  records.forEach((record, index) => {
    const row = normalizedIdentity(record);
    if (row.sku) {
      const list = bySku.get(row.sku) ?? [];
      list.push(index);
      bySku.set(row.sku, list);
    }
    if (row.productId) {
      const list = byProductId.get(row.productId) ?? [];
      list.push(index);
      byProductId.set(row.productId, list);
    }
  });
  return { bySku, byProductId };
};

export const matchMissingToLegacy = (
  missing: LegacyIdentity,
  records: LegacyIdentity[],
  bySku: Map<string, number[]>,
  byProductId: Map<string, number[]>,
): MissingLegacyMatch => {
  const row = normalizedIdentity(missing);
  const skuIndexes = row.sku ? (bySku.get(row.sku) ?? []) : [];
  const idIndexes = row.productId ? (byProductId.get(row.productId) ?? []) : [];

  if (row.sku && row.productId) {
    const both = skuIndexes.filter(
      (index) => normalizedIdentity(records[index] ?? { productId: '', sku: '' }).productId === row.productId,
    );
    if (both.length === 1) return { status: 'found', reason: 'Legacy row matched SKU and Product ID' };
    if (both.length > 1) return { status: 'conflict', reason: 'Duplicate legacy rows for this SKU and Product ID' };
    if (skuIndexes.length > 0) return { status: 'conflict', reason: 'SKU matches but Product ID differs' };
    if (idIndexes.length > 0) return { status: 'conflict', reason: 'Product ID matches but SKU differs' };
    return { status: 'none', reason: 'No legacy image record found' };
  }

  if (row.sku) {
    if (skuIndexes.length === 1) return { status: 'found', reason: 'Legacy row matched SKU' };
    if (skuIndexes.length > 1) return { status: 'conflict', reason: 'Duplicate legacy SKU records' };
    return { status: 'none', reason: 'No legacy image record found' };
  }

  if (row.productId) {
    if (idIndexes.length === 1) return { status: 'found', reason: 'Legacy row matched Product ID' };
    if (idIndexes.length > 1) return { status: 'conflict', reason: 'Duplicate legacy Product ID records' };
    return { status: 'none', reason: 'No legacy image record found' };
  }

  return { status: 'none', reason: 'No legacy image record found' };
};

export const decideCachedImageReuse = (input: {
  cachedKey: string | undefined;
  objectExists: boolean;
  validationOk: boolean;
}): CachedImageReuse => {
  const key = input.cachedKey?.trim() ?? '';
  if (!key) return { action: 'redownload', reason: 'Not in backup cache' };
  if (!input.objectExists) return { action: 'redownload', reason: 'GCS object missing' };
  if (!input.validationOk) {
    return { action: 'redownload', reason: 'GCS object is empty or not a readable image' };
  }
  return { action: 'reuse', key };
};

export const harvestCacheLookupKeys = (url: string): string[] => {
  const trimmed = url.trim();
  if (!trimmed) return [];
  const keys = [trimmed];
  const legacy = toLegacyCurekaImageUrl(trimmed);
  if (legacy && legacy !== trimmed) keys.push(legacy);
  if (/^https?:\/\/legacy\.cureka\.com/i.test(trimmed)) {
    keys.push(trimmed.replace(/^https?:\/\/legacy\.cureka\.com/i, 'https://www.cureka.com'));
  }
  return [...new Set(keys)];
};

export const findHarvestedGcsKey = (
  cache: Map<string, string> | undefined,
  url: string,
): string | undefined => {
  if (!cache) return undefined;
  for (const candidate of harvestCacheLookupKeys(url)) {
    const key = cache.get(candidate)?.trim();
    if (key && STORAGE_KEY_RE.test(key)) return key;
  }
  return undefined;
};

export const rememberHarvestCacheKey = (
  cache: Map<string, string>,
  sourceUrl: string,
  gcsKey: string,
): void => {
  const key = gcsKey.trim();
  if (!key) return;
  for (const candidate of harvestCacheLookupKeys(sourceUrl)) {
    cache.set(candidate, key);
  }
};

export const forgetHarvestCacheKey = (cache: Map<string, string>, gcsKey: string): void => {
  const key = gcsKey.trim();
  if (!key) return;
  for (const [url, stored] of cache) {
    if (stored === key) cache.delete(url);
  }
};

const appendUniqueKeys = (base: string[], extra: string[]): string[] => {
  const seen = new Set(base);
  const keys = [...base];
  for (const key of extra) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    keys.push(trimmed);
  }
  return keys;
};

const withoutInvalidated = (keys: string[], invalidated: ReadonlySet<string>): string[] =>
  keys.map((key) => key.trim()).filter((key) => key && !invalidated.has(key));

/**
 * Append newly validated keys. Never replace a non-empty gallery with an empty
 * list. Drop a key that failed validation when a replacement exists; if dropping
 * it would leave nothing, keep the previous list.
 */
export const mergeHarvestedImageRows = (
  existing: HarvestMapRow[],
  incoming: HarvestMapRow[],
  invalidatedKeys: ReadonlySet<string> = new Set(),
): HarvestMapRow[] => {
  const rows: HarvestMapRow[] = [];
  const byProductId = new Map<string, HarvestMapRow>();
  const bySku = new Map<string, HarvestMapRow>();

  const place = (row: HarvestMapRow): void => {
    const productId = normalizeLookupProductId(row.productId);
    const sku = normalizeLookupSku(row.sku);
    const keys = row.keys.map((key) => key.trim()).filter(Boolean);
    const target =
      (productId ? byProductId.get(productId) : undefined) ??
      (!productId && sku ? bySku.get(sku) : undefined);
    if (!target) {
      const created: HarvestMapRow = { productId, sku, keys: [...keys] };
      rows.push(created);
      if (productId) byProductId.set(productId, created);
      if (sku && !bySku.has(sku)) bySku.set(sku, created);
      return;
    }
    if (!target.sku && sku) {
      target.sku = sku;
      if (!bySku.has(sku)) bySku.set(sku, target);
    }
    if (!target.productId && productId) {
      target.productId = productId;
      byProductId.set(productId, target);
    }
    target.keys = appendUniqueKeys(target.keys, keys);
  };

  for (const row of existing) place(row);

  for (const row of incoming) {
    const productId = normalizeLookupProductId(row.productId);
    const sku = normalizeLookupSku(row.sku);
    const target =
      (productId ? byProductId.get(productId) : undefined) ??
      (sku ? bySku.get(sku) : undefined);
    const incomingKeys = row.keys.map((key) => key.trim()).filter(Boolean);
    if (!target) {
      if (!incomingKeys.length) continue;
      place({ productId, sku, keys: incomingKeys });
      continue;
    }
    if (!target.sku && sku) {
      target.sku = sku;
      if (!bySku.has(sku)) bySku.set(sku, target);
    }
    if (!target.productId && productId) {
      target.productId = productId;
      if (!byProductId.has(productId)) byProductId.set(productId, target);
    }
    const kept = withoutInvalidated(target.keys, invalidatedKeys);
    const merged = appendUniqueKeys(kept, incomingKeys);
    target.keys = merged.length > 0 ? merged : target.keys;
  }

  return rows
    .filter((row) => (row.productId || row.sku) && row.keys.length > 0)
    .sort((left, right) => {
      const idOrder = left.productId.localeCompare(right.productId, undefined, { numeric: true });
      if (idOrder !== 0) return idOrder;
      return left.sku.localeCompare(right.sku);
    });
};

export const resolveHarvestedImageKeys = (
  productId: string,
  sku: string,
  byProductId: Map<string, string[]>,
  bySku: Map<string, string[]>,
): { keys: string[]; conflict: boolean } => {
  const idKey = normalizeLookupProductId(productId);
  const skuKey = normalizeLookupSku(sku);
  const byId = idKey ? byProductId.get(idKey) : undefined;
  const bySkuKeys = skuKey ? bySku.get(skuKey) : undefined;
  if (byId?.length && bySkuKeys?.length && !sameImageKeyList(byId, bySkuKeys)) {
    return { keys: [], conflict: true };
  }
  if (byId?.length) return { keys: byId, conflict: false };
  if (bySkuKeys?.length) return { keys: bySkuKeys, conflict: false };
  return { keys: [], conflict: false };
};

const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? '').join('').trim();
  }
  if ('result' in value && value.result !== undefined && value.result !== null) {
    return String(value.result).trim();
  }
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  return String(cell.text ?? '').trim();
};

const normalizeHeader = (value: string): string =>
  value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

export interface IdSkuImageRow {
  productId: string;
  sku: string;
  imageUrls: string[];
}

export const loadIdSkuImageSheet = async (
  filePath: string,
  options?: { requireImages?: boolean },
): Promise<IdSkuImageRow[]> => {
  const absolute = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  await access(absolute);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolute);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header) headers.set(header, columnNumber);
  });

  const idColumn = ['id', 'product id', 'external product id']
    .map((name) => headers.get(name))
    .find((index) => index !== undefined);
  const skuColumn = ['sku', 'product sku'].map((name) => headers.get(name)).find((index) => index !== undefined);
  const imagesColumn = ['images', 'image', 'image urls', 'image url']
    .map((name) => headers.get(name))
    .find((index) => index !== undefined);

  if (idColumn === undefined && skuColumn === undefined) {
    throw new Error(`Sheet ${absolute} has no Product ID or SKU column`);
  }
  if (options?.requireImages && imagesColumn === undefined) {
    throw new Error(`Sheet ${absolute} has no Images column`);
  }

  const rows: IdSkuImageRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const productId = idColumn !== undefined ? cellText(row.getCell(idColumn)) : '';
    const sku = skuColumn !== undefined ? cellText(row.getCell(skuColumn)) : '';
    const imageUrls =
      imagesColumn !== undefined ? parseLegacyImageList(cellText(row.getCell(imagesColumn))) : [];
    if (!productId.trim() && !sku.trim()) continue;
    if (options?.requireImages && !imageUrls.length) continue;
    rows.push({ productId: productId.trim(), sku: sku.trim(), imageUrls });
  }
  return rows;
};
