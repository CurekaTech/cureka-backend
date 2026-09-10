/** Sentinel for undefined/null/empty filter values in list cache keys. */
const CACHE_KEY_ABSENT = '_';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Stable JSON for objects/arrays so filter objects never hash as "[object Object]". */
const stableSerialize = (value: unknown): string => {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) => stableSerialize(item)).sort();
    return `[${parts.join(',')}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
};

/** Normalizes a filter value so 0/false are not treated as "missing". */
export const normalizeCacheFilterValue = (value: unknown): string => {
  if (value === undefined || value === null) return CACHE_KEY_ABSENT;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : CACHE_KEY_ABSENT;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    return text.length > 0 ? text : CACHE_KEY_ABSENT;
  }
  if (Array.isArray(value)) {
    if (!value.length) return CACHE_KEY_ABSENT;
    // Primitive arrays (brandIds, categoryFilterValues): order-independent.
    if (
      value.every(
        (item) =>
          item === null ||
          item === undefined ||
          typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean',
      )
    ) {
      const parts = value
        .map((item) => normalizeCacheFilterValue(item))
        .filter((part) => part !== CACHE_KEY_ABSENT)
        .sort();
      return parts.length ? parts.join(',') : CACHE_KEY_ABSENT;
    }
    // Object arrays (e.g. categoryFilterCriteria): stable JSON per element, sorted.
    const parts = value.map((item) => stableSerialize(item)).sort();
    return parts.join('|');
  }
  if (isPlainObject(value)) {
    return stableSerialize(value);
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
