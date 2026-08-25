const SAFE_LOG_HEADER_NAMES = new Set([
  'accept',
  'cache-control',
  'content-length',
  'content-type',
  'date',
  'etag',
  'expires',
  'pragma',
  'retry-after',
  'server',
  'vary',
  'x-correlation-id',
  'x-request-id',
]);

/**
 * Keep only non-sensitive HTTP headers for logs.
 * Drops authorization, cookie, set-cookie, API keys, and any other header
 * not on the allow-list so provider secrets never reach stdout.
 */
export function sanitizeHeadersForLog(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [name, value] of iterateHeaderEntries(headers)) {
    const key = name.toLowerCase();
    if (!SAFE_LOG_HEADER_NAMES.has(key)) {
      continue;
    }
    out[key] = value;
  }

  return out;
}

function iterateHeaderEntries(headers: unknown): Array<[string, string]> {
  if (headers == null) {
    return [];
  }

  if (isFetchHeaders(headers)) {
    const pairs: Array<[string, string]> = [];
    headers.forEach((value, key) => {
      pairs.push([key, value]);
    });
    return pairs;
  }

  if (typeof headers !== 'object') {
    return [];
  }

  const pairs: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(headers as Record<string, unknown>)) {
    if (raw == null || raw === '') {
      continue;
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item != null && item !== '') {
          pairs.push([key, String(item)]);
        }
      }
      continue;
    }
    pairs.push([key, String(raw)]);
  }
  return pairs;
}

function isFetchHeaders(value: unknown): value is { forEach: (cb: (value: string, key: string) => void) => void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { forEach?: unknown }).forEach === 'function'
  );
}
