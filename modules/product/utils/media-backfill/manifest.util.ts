import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { createGunzip } from 'zlib';
import { basenameKey } from './url.util';
import { ManifestIndex } from './types';

const UPLOADS_PREFIX = 'wp-content/uploads/';

/**
 * Accept either:
 * - `wp-content/uploads/2024/10/file.jpg` (absolute under WP)
 * - `2024/10/file.jpg` (relative to uploads dir — common find output)
 */
export const normalizeManifestRelativePath = (raw: string): string | null => {
  let path = raw.trim().replace(/\\/g, '/');
  if (!path) return null;
  // strip leading ./ or /
  path = path.replace(/^\.?\//, '');
  while (path.startsWith('../')) {
    path = path.slice(3);
  }
  if (path.includes('\0') || path.split('/').some((p) => p === '..')) return null;

  const lower = path.toLowerCase();
  const idx = lower.indexOf(UPLOADS_PREFIX);
  if (idx !== -1) {
    return path.slice(idx);
  }

  // Year/month relative paths from a find run inside wp-content/uploads
  if (/^\d{4}\/\d{2}\//.test(path)) {
    return `${UPLOADS_PREFIX}${path}`;
  }

  return null;
};

export const loadManifestIndex = async (filePath: string): Promise<ManifestIndex> => {
  const byBasename = new Map<string, string[]>();
  let entryCount = 0;
  const hash = createHash('sha256');

  const isGzip = filePath.toLowerCase().endsWith('.gz');
  const fileStream = createReadStream(filePath);
  const input = isGzip ? fileStream.pipe(createGunzip()) : fileStream;

  input.on('data', (chunk: Buffer) => hash.update(chunk));

  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    const relativeRaw = parts[0] ?? '';
    const basenameRaw = parts[1] ?? '';
    const relative = normalizeManifestRelativePath(relativeRaw);
    if (!relative) continue;

    const base =
      basenameKey(basenameRaw) ||
      basenameKey(relative.split('/').pop() ?? '');
    if (!base) continue;

    const list = byBasename.get(base) ?? [];
    if (!list.includes(relative)) {
      list.push(relative);
      byBasename.set(base, list);
    }
    entryCount += 1;
  }

  return {
    byBasename,
    entryCount,
    fingerprint: hash.digest('hex'),
  };
};

export const lookupManifestCandidates = (
  index: ManifestIndex | null | undefined,
  filename: string,
): string[] => {
  if (!index) return [];
  const key = basenameKey(filename);
  if (!key) return [];
  return [...(index.byBasename.get(key) ?? [])];
};
