export const CMS_ALT_TEXT_MAX_LENGTH = 250;

export interface CmsAltBackfillSlot {
  id: string;
  altText: string | null;
  label: string | null;
}

export interface CmsAltBackfillCounts {
  scanned: number;
  missing: number;
  eligible: number;
  updated: number;
  skipped: number;
  failed: number;
}

/** Undefined when the field was omitted or null. Empty string is decorative. */
export const normalizeCmsAltText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > CMS_ALT_TEXT_MAX_LENGTH) {
    return trimmed.slice(0, CMS_ALT_TEXT_MAX_LENGTH);
  }
  return trimmed;
};

export const fileStorageKey = (file: unknown): string | null => {
  if (file == null || file === '') return null;
  if (typeof file === 'string') {
    const trimmed = file.trim();
    return trimmed || null;
  }
  if (typeof file === 'object' && 'key' in file) {
    const key = (file as { key?: unknown }).key;
    if (typeof key === 'string' && key.trim()) return key.trim();
  }
  return null;
};

/**
 * Undefined means leave the stored column alone.
 * A different file without a new alt text clears the previous text.
 */
export const resolveStoredAltText = (input: {
  incoming: unknown;
  previousAlt?: string | null;
  previousFile: unknown;
  nextFile: unknown;
}): string | null | undefined => {
  const provided = normalizeCmsAltText(input.incoming);
  if (typeof input.incoming === 'string') return provided ?? '';
  if (fileStorageKey(input.previousFile) === fileStorageKey(input.nextFile)) return undefined;
  return null;
};

export const assignStoredAltText = <T extends object, K extends string>(
  payload: T,
  key: K,
  input: {
    incoming: unknown;
    previousAlt?: string | null;
    previousFile: unknown;
    nextFile: unknown;
  },
): void => {
  const resolved = resolveStoredAltText(input);
  if (resolved !== undefined) {
    (payload as unknown as Record<K, string | null>)[key] = resolved;
  }
};

export const storedAltForCreate = (incoming: unknown): string | null =>
  typeof incoming === 'string' ? (normalizeCmsAltText(incoming) ?? '') : null;

export const mergeJsonImageAlt = (input: {
  incoming: unknown;
  previousAlt?: string | null;
  previousFile: unknown;
  nextFile: unknown;
}): string | null => {
  const resolved = resolveStoredAltText(input);
  return resolved === undefined ? (input.previousAlt ?? null) : resolved;
};

export const buildCmsAltText = (label: string | null | undefined): string | null => {
  const text = label?.trim() ?? '';
  if (!text) return null;
  return text.length > CMS_ALT_TEXT_MAX_LENGTH ? text.slice(0, CMS_ALT_TEXT_MAX_LENGTH).trim() : text;
};

const emptyCounts = (): CmsAltBackfillCounts => ({
  scanned: 0,
  missing: 0,
  eligible: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
});

export const applyCmsAltBackfillBatch = async (
  slots: CmsAltBackfillSlot[],
  options: { apply: boolean; overwrite: boolean },
  persist: (id: string, altText: string) => Promise<void>,
): Promise<CmsAltBackfillCounts> => {
  const counts = emptyCounts();

  for (const slot of slots) {
    counts.scanned += 1;
    const next = buildCmsAltText(slot.label);
    if (!next) {
      counts.missing += 1;
      counts.skipped += 1;
      continue;
    }
    if (slot.altText !== null && !options.overwrite) {
      counts.skipped += 1;
      continue;
    }
    counts.eligible += 1;
    if (!options.apply) continue;
    try {
      await persist(slot.id, next);
      counts.updated += 1;
    } catch {
      counts.failed += 1;
    }
  }

  return counts;
};
