import { normalizeStorageKey } from '@packages/storage';

export const ALT_TEXT_MAX_LENGTH = 250;

export interface MediaAltSource {
  variantId: string | null;
  storageKey: string;
  /** Undefined means the client omitted alt text. An empty string is decorative. */
  altText?: string;
}

export interface StoredMediaAlt {
  variantId: string | null;
  storageKey: string;
  altText: string | null;
}

export interface ProductMediaAltTextParts {
  brandName?: string | null;
  productName?: string | null;
  variantDisplayName?: string | null;
  packLabel?: string | null;
}

export interface AltTextBackfillSourceRow extends ProductMediaAltTextParts {
  id: string;
  altText: string | null;
}

export interface AltTextBackfillCounts {
  scanned: number;
  missing: number;
  eligible: number;
  updated: number;
  skipped: number;
  failed: number;
}

export const mediaAltMatchKey = (variantId: string | null, storageKey: string): string => {
  const key = normalizeStorageKey(storageKey) ?? storageKey.trim();
  return `${variantId ?? ''}|${key}`;
};

/**
 * Undefined when the field was omitted or null.
 * Empty string is kept so a decorative image is distinct from "not set".
 */
export const normalizeIncomingAltText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > ALT_TEXT_MAX_LENGTH) {
    return trimmed.slice(0, ALT_TEXT_MAX_LENGTH);
  }
  return trimmed;
};

/** Blank sheet cells are omitted so an old template does not clear stored alt text. */
export const normalizeOptionalBulkAltText = (value: string | undefined): string | undefined => {
  const normalized = normalizeIncomingAltText(value);
  return normalized ? normalized : undefined;
};

export const resolveMediaAltText = (
  incoming: string | undefined,
  previous: string | null | undefined,
): string | null => {
  if (incoming === undefined) return previous ?? null;
  return incoming;
};

export const applyPreservedAltText = <T extends MediaAltSource>(
  incoming: T[],
  existing: StoredMediaAlt[],
): Array<Omit<T, 'altText'> & { altText: string | null }> => {
  const previous = new Map<string, string | null>();
  for (const row of existing) {
    previous.set(mediaAltMatchKey(row.variantId, row.storageKey), row.altText);
  }

  return incoming.map((row) => ({
    ...row,
    altText: resolveMediaAltText(
      row.altText,
      previous.get(mediaAltMatchKey(row.variantId, row.storageKey)),
    ),
  }));
};

const containsText = (haystack: string, needle: string): boolean =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/**
 * Alt text from stored names only. Returns null when the product has no name.
 */
export const buildProductMediaAltText = (parts: ProductMediaAltTextParts): string | null => {
  const productName = parts.productName?.trim() ?? '';
  if (!productName) return null;

  const brand = parts.brandName?.trim() ?? '';
  const variant = parts.variantDisplayName?.trim() ?? '';
  const pack = parts.packLabel?.trim() ?? '';

  let text =
    brand && !productName.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${productName}`
      : productName;

  if (variant && variant.toLowerCase() !== productName.toLowerCase() && !containsText(text, variant)) {
    text = `${text}, ${variant}`;
  }
  if (pack && !containsText(text, pack)) {
    text = `${text}, ${pack}`;
  }

  return text.length > ALT_TEXT_MAX_LENGTH ? text.slice(0, ALT_TEXT_MAX_LENGTH).trim() : text;
};

const emptyCounts = (): AltTextBackfillCounts => ({
  scanned: 0,
  missing: 0,
  eligible: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
});

/**
 * Decides and optionally writes alt text for one batch.
 * Dry-run (`apply: false`) never calls `persist`.
 * A single persist failure is counted and the rest of the batch continues.
 */
export const applyAltTextBackfillBatch = async (
  rows: AltTextBackfillSourceRow[],
  options: { apply: boolean; overwrite: boolean },
  persist: (id: string, altText: string) => Promise<void>,
): Promise<AltTextBackfillCounts> => {
  const counts = emptyCounts();

  for (const row of rows) {
    counts.scanned += 1;
    const next = buildProductMediaAltText(row);
    if (!next) {
      counts.missing += 1;
      counts.skipped += 1;
      continue;
    }

    const existing = row.altText;
    if (existing !== null && !options.overwrite) {
      counts.skipped += 1;
      continue;
    }

    counts.eligible += 1;
    if (!options.apply) continue;

    try {
      await persist(row.id, next);
      counts.updated += 1;
    } catch {
      counts.failed += 1;
    }
  }

  return counts;
};
