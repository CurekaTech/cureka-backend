import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { LEGACY_ORIGIN, OverrideMapping } from './types';
import { rewriteToLegacyOrigin } from './url.util';

const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
};

export const loadOverrideMapping = async (filePath: string): Promise<OverrideMapping> => {
  const byOriginalUrl = new Map<string, { resolvedUrl: string; note?: string }>();
  const invalid: OverrideMapping['invalid'] = [];

  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let headerSkipped = false;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cells = splitCsvLine(trimmed);
    if (!headerSkipped) {
      headerSkipped = true;
      const header = cells.map((c) => c.toLowerCase()).join(',');
      if (header.includes('original_url') && header.includes('resolved_url')) {
        continue;
      }
    }

    const original = (cells[0] ?? '').trim();
    const resolved = (cells[1] ?? '').trim();
    const note = (cells[2] ?? '').trim() || undefined;
    if (!original || !resolved) {
      invalid.push({
        original_url: original,
        resolved_url: resolved,
        error: 'original_url and resolved_url are required',
      });
      continue;
    }

    const resolvedNormalized = rewriteToLegacyOrigin(resolved);
    if (!resolvedNormalized.toLowerCase().startsWith(LEGACY_ORIGIN.toLowerCase())) {
      invalid.push({
        original_url: original,
        resolved_url: resolved,
        error: `resolved_url must use ${LEGACY_ORIGIN}`,
      });
      continue;
    }

    const key = rewriteToLegacyOrigin(original).toLowerCase();
    byOriginalUrl.set(key, { resolvedUrl: resolvedNormalized, note });
  }

  return { byOriginalUrl, invalid };
};

export const findOverride = (
  mapping: OverrideMapping | null | undefined,
  originalUrl: string,
): { resolvedUrl: string; note?: string } | null => {
  if (!mapping) return null;
  const key = rewriteToLegacyOrigin(originalUrl).toLowerCase();
  return mapping.byOriginalUrl.get(key) ?? null;
};
