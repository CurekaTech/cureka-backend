import {
  effectiveVariantProductId,
  findHarvestedGcsKey,
  type HarvestMapRow,
  type VariantMatchCandidate,
} from './legacy-image-reconcile.util';
import {
  normalizeLookupProductId,
  normalizeLookupSku,
} from './bulk-upload-reference-lookup.util';

export interface RecoverLegacyRow {
  productId: string;
  sku: string;
  imageUrls: string[];
}

export interface RecoverIdentity {
  sku: string;
  productId: string;
}

export type GroupedLegacyPair =
  | { status: 'ready'; identity: RecoverIdentity; imageUrls: string[] }
  | { status: 'conflict'; identity: RecoverIdentity; reason: string };

export interface GroupedLegacySheet {
  byPair: Map<string, GroupedLegacyPair>;
  rows: Array<RecoverIdentity & { imageUrls: string[] }>;
}

export type LegacyPairLookup =
  | { status: 'match'; imageUrls: string[] }
  | { status: 'conflict'; reason: string }
  | { status: 'sku_mismatch'; reason: string }
  | { status: 'product_id_mismatch'; reason: string }
  | { status: 'none'; reason: string }
  | { status: 'incomplete'; reason: string };

export type MapPairLookup =
  | { status: 'keys'; keys: string[] }
  | { status: 'none' }
  | { status: 'conflict'; reason: string }
  | { status: 'incomplete' };

export type OrphanBackupResult =
  | 'NOT_IN_DB_BACKUP_REUSED'
  | 'NOT_IN_DB_BACKUP_CREATED'
  | 'NOT_IN_DB_BACKUP_FAILED'
  | 'NOT_IN_DB_NO_VALID_IMAGE'
  | 'DEFERRED';

const PAIR_SEPARATOR = '\u0000';

export const recoverIdentity = (sku: string, productId: string): RecoverIdentity => ({
  sku: normalizeLookupSku(sku),
  productId: normalizeLookupProductId(productId),
});

export const recoverPairKey = (identity: RecoverIdentity): string =>
  `${identity.sku}${PAIR_SEPARATOR}${identity.productId}`;

export const variantRecoverIdentity = (
  variant: VariantMatchCandidate,
): RecoverIdentity | null => {
  const identity = recoverIdentity(variant.sku, effectiveVariantProductId(variant));
  if (!identity.sku || !identity.productId) return null;
  return identity;
};

const sameStringList = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const groupLegacyRows = (rows: RecoverLegacyRow[]): GroupedLegacySheet => {
  const byPair = new Map<string, GroupedLegacyPair>();
  const normalized: GroupedLegacySheet['rows'] = [];

  for (const row of rows) {
    const identity = recoverIdentity(row.sku, row.productId);
    const imageUrls = row.imageUrls.map((url) => url.trim()).filter(Boolean);
    if (!identity.sku && !identity.productId && !imageUrls.length) continue;
    normalized.push({ ...identity, imageUrls });
    if (!identity.sku || !identity.productId) continue;

    const key = recoverPairKey(identity);
    const existing = byPair.get(key);
    if (!existing) {
      byPair.set(key, { status: 'ready', identity, imageUrls });
      continue;
    }
    if (existing.status === 'conflict') continue;
    if (!sameStringList(existing.imageUrls, imageUrls)) {
      byPair.set(key, {
        status: 'conflict',
        identity,
        reason: 'Duplicate legacy rows for this SKU and Product ID disagree',
      });
    }
  }

  return { byPair, rows: normalized };
};

export const lookupLegacyPair = (
  sheet: GroupedLegacySheet,
  sku: string,
  productId: string,
): LegacyPairLookup => {
  const identity = recoverIdentity(sku, productId);
  if (!identity.sku || !identity.productId) {
    return { status: 'incomplete', reason: 'SKU and Product ID are both required' };
  }

  const grouped = sheet.byPair.get(recoverPairKey(identity));
  if (grouped?.status === 'conflict') return { status: 'conflict', reason: grouped.reason };
  if (grouped?.status === 'ready') return { status: 'match', imageUrls: grouped.imageUrls };

  const skuHit = sheet.rows.some((row) => row.sku === identity.sku && row.productId !== identity.productId);
  if (skuHit) return { status: 'sku_mismatch', reason: 'SKU matches but Product ID differs' };
  const idHit = sheet.rows.some((row) => row.productId === identity.productId && row.sku !== identity.sku);
  if (idHit) return { status: 'product_id_mismatch', reason: 'Product ID matches but SKU differs' };
  return { status: 'none', reason: 'No matching SKU + productId found' };
};

export const indexVariantsByPair = (
  variants: VariantMatchCandidate[],
): Map<string, VariantMatchCandidate[]> => {
  const grouped = new Map<string, VariantMatchCandidate[]>();
  for (const variant of variants) {
    const identity = variantRecoverIdentity(variant);
    if (!identity) continue;
    const key = recoverPairKey(identity);
    const list = grouped.get(key) ?? [];
    list.push(variant);
    grouped.set(key, list);
  }
  return grouped;
};

export const findMapKeysForPair = (
  rows: HarvestMapRow[],
  sku: string,
  productId: string,
): MapPairLookup => {
  const identity = recoverIdentity(sku, productId);
  if (!identity.sku || !identity.productId) return { status: 'incomplete' };

  const matches = rows.filter((row) => {
    const rowIdentity = recoverIdentity(row.sku, row.productId);
    return rowIdentity.sku === identity.sku && rowIdentity.productId === identity.productId;
  });
  if (!matches.length) return { status: 'none' };

  const lists = matches.map((row) => row.keys.map((key) => key.trim()).filter(Boolean));
  const first = lists[0] ?? [];
  if (lists.some((keys) => !sameStringList(keys, first))) {
    return { status: 'conflict', reason: 'GCS map rows for this SKU and Product ID disagree' };
  }
  if (!first.length) return { status: 'none' };
  return { status: 'keys', keys: first };
};

const appendUnique = (base: string[], extra: string[]): string[] => {
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

/** Add keys only to the row with the same SKU and Product ID. Never joins a single-key row. */
export const upsertPairMapRow = (
  rows: HarvestMapRow[],
  input: { sku: string; productId: string; keys: string[] },
): HarvestMapRow[] => {
  const identity = recoverIdentity(input.sku, input.productId);
  const keys = input.keys.map((key) => key.trim()).filter(Boolean);
  if (!identity.sku || !identity.productId || !keys.length) return rows;

  const next = rows.map((row) => ({ ...row, keys: [...row.keys] }));
  const index = next.findIndex((row) => {
    const rowIdentity = recoverIdentity(row.sku, row.productId);
    return rowIdentity.sku === identity.sku && rowIdentity.productId === identity.productId;
  });
  if (index < 0) {
    next.push({ productId: identity.productId, sku: identity.sku, keys });
    return next;
  }
  const current = next[index];
  if (!current) return next;
  next[index] = { ...current, productId: identity.productId, sku: identity.sku, keys: appendUnique(current.keys, keys) };
  return next;
};

/** Conflict rows must not replace a stored gallery. */
export const applyOrphanMapUpdate = (
  rows: HarvestMapRow[],
  pair: GroupedLegacyPair,
  keys: string[],
): HarvestMapRow[] => {
  if (pair.status !== 'ready') return rows;
  return upsertPairMapRow(rows, { sku: pair.identity.sku, productId: pair.identity.productId, keys });
};

export const variantNeedsImageRecovery = (
  images: Array<{ key: string; valid: boolean }>,
): boolean => {
  if (!images.length) return true;
  return !images.some((image) => image.key.trim() && image.valid);
};

export const splitUrlsByCache = (
  urls: string[],
  cache: Map<string, string> | undefined,
  invalidKeys: ReadonlySet<string> = new Set(),
): { reuse: Array<{ url: string; key: string }>; download: string[] } => {
  const reuse: Array<{ url: string; key: string }> = [];
  const download: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const key = findHarvestedGcsKey(cache, url);
    if (key && !invalidKeys.has(key)) reuse.push({ url, key });
    else download.push(url);
  }
  return { reuse, download };
};

export const mergeReuseKeys = (ordered: string[], extra: string[]): string[] => appendUnique(ordered, extra);

export const classifyOrphanResult = (input: {
  imageUrls: string[];
  downloaded: number;
  failed: number;
  reused: number;
  deferred: number;
}): OrphanBackupResult => {
  if (!input.imageUrls.length) return 'NOT_IN_DB_NO_VALID_IMAGE';
  if (input.failed > 0) return 'NOT_IN_DB_BACKUP_FAILED';
  if (input.deferred > 0) return 'DEFERRED';
  if (input.downloaded > 0) return 'NOT_IN_DB_BACKUP_CREATED';
  if (input.reused > 0) return 'NOT_IN_DB_BACKUP_REUSED';
  return 'NOT_IN_DB_NO_VALID_IMAGE';
};

export const orphanPairs = (
  sheet: GroupedLegacySheet,
  variantsByPair: Map<string, VariantMatchCandidate[]>,
): GroupedLegacyPair[] => {
  const pairs: GroupedLegacyPair[] = [];
  for (const [key, pair] of sheet.byPair) {
    if (variantsByPair.has(key)) continue;
    pairs.push(pair);
  }
  return pairs;
};
