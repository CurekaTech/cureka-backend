/** Sentinel for undefined/null/empty filter values in list cache keys. */
const CACHE_KEY_ABSENT = '_';

/** Normalizes a filter value so 0/false are not treated as "missing". */
export const normalizeCacheFilterValue = (value: unknown): string => {
  if (value === undefined || value === null) return CACHE_KEY_ABSENT;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : CACHE_KEY_ABSENT;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : CACHE_KEY_ABSENT;
};

/**
 * Builds a deterministic, Redis-safe cache key suffix from list query filters.
 * Each unique filter combination (including hierarchyLevel=0 vs 1) gets its own key.
 */
export const buildQueryCacheHash = (query: Record<string, unknown>): string =>
  Object.keys(query)
    .sort()
    .map((key) => `${key}=${normalizeCacheFilterValue(query[key])}`)
    .join('&');
