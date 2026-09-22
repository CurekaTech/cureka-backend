const GCS_OBJECT_PATH_PATTERN = /storage\.googleapis\.com\/[^/]+\/(.+)$/i;

export function tryParseEmbeddedStorageReference(
  value: string,
): { key: string; name?: string } | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  try {
    const parsed = JSON.parse(trimmed) as { key?: unknown; name?: unknown };
    if (typeof parsed.key !== 'string' || !parsed.key.trim()) return null;
    return {
      key: parsed.key.trim(),
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
    };
  } catch {
    return null;
  }
}

const extractKeyAfterMarker = (value: string, marker: string): string | null => {
  const idx = value.indexOf(marker);
  if (idx < 0) return null;
  const raw = value.slice(idx + marker.length).split('?')[0]!.replace(/^\/+/, '');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/** Normalize any stored value to a bucket-relative object key, e.g. `images/uuid.webp`. */
export const normalizeStorageKey = (stored: string | null | undefined): string | null => {
  if (!stored?.trim()) return null;

  const embedded = tryParseEmbeddedStorageReference(stored);
  if (embedded) {
    return normalizeStorageKey(embedded.key);
  }

  const value = stored.trim();

  if (value.startsWith('http://') || value.startsWith('https://')) {
    const gcsMatch = value.match(GCS_OBJECT_PATH_PATTERN);
    if (gcsMatch?.[1]) return gcsMatch[1].split('?')[0]!;

    // Admin/GET often round-trips stable public media URLs:
    // https://host/api/v1/public/media/images/<uuid>.jpg → images/<uuid>.jpg
    const publicMediaKey = extractKeyAfterMarker(value, '/public/media/');
    if (publicMediaKey) return publicMediaKey;

    const filesIndex = value.indexOf('/files/');
    if (filesIndex >= 0) return value.slice(filesIndex + '/files/'.length).split('?')[0]!;

    const uploadsIndex = value.indexOf('/uploads/');
    if (uploadsIndex >= 0) return value.slice(uploadsIndex + '/uploads/'.length).split('?')[0]!;

    return null;
  }

  const publicMediaRelative = extractKeyAfterMarker(value, '/public/media/');
  if (publicMediaRelative) return publicMediaRelative;

  if (value.startsWith('/files/')) return value.slice('/files/'.length);
  if (value.startsWith('/uploads/')) return value.slice('/uploads/'.length);
  if (value.startsWith('files/')) return value.slice('files/'.length);
  if (value.startsWith('uploads/')) return value.slice('uploads/'.length);

  return value.replace(/^\/+/, '');
};

export const extractRelativeStoragePath = normalizeStorageKey;
