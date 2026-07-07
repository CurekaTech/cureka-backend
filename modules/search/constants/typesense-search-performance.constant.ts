/** Autocomplete tuning — favor low latency over exhaustive recall. */
export const TYPESENSE_FAST_SEARCH_PARAMS = {
  num_typos: 1,
  prefix: true,
  exhaustive_search: false,
  drop_tokens_threshold: 0,
  search_cutoff_ms: 80,
} as const;

/** Short TTL cache for repeated dropdown keystrokes / backspace. */
export const SEARCH_RESPONSE_CACHE_TTL_MS = 15_000;
export const SEARCH_RESPONSE_CACHE_MAX_ENTRIES = 128;

/** Max hits fetched per entity bucket (dropdown merges into per_page total). */
export const SEARCH_ENTITY_FETCH_LIMIT = 4;
