/** Alphanumeric-only form used to ignore spaces and punctuation. */
export function compactSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * 1 typo for shorter names, 2 typos once the compact query is 7+ characters.
 * Typesense itself caps num_typos at 2.
 */
export function searchTypoBudget(compactLength: number): number {
  if (compactLength <= 0) return 0;
  if (compactLength < 7) return 1;
  return 2;
}

/**
 * A spaced or punctuated query should also be tried as one compact token.
 * "ceta phil" → "cetaphil". An already-compact query does not need this retry.
 */
/**
 * Words long enough to identify a product on their own.
 * "cetaphil serum" → ["cetaphil", "serum"], longest first.
 */
export function significantSearchTokens(query: string): string[] {
  const tokens = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.replace(/[^a-z0-9]+/g, ''))
        .filter((token) => token.length >= 4),
    ),
  ];
  tokens.sort((left, right) => right.length - left.length || left.localeCompare(right));
  return tokens;
}

export function searchQueryNeedsCompactRetry(query: string): boolean {
  const compact = compactSearchText(query);
  if (compact.length < 3) return false;
  const trimmed = query.trim().toLowerCase();
  return /\s/.test(trimmed) || compact !== trimmed;
}

/**
 * Keyboard-mash and vowel-less strings. A real word we do not sell (for example
 * "iphone") is not gibberish. Short prefixes are left to the existing search.
 */
export function isGibberishSearchQuery(query: string): boolean {
  const letters = compactSearchText(query).replace(/[0-9]/g, '');
  if (letters.length < 5) return false;

  const vowels = letters.match(/[aeiouy]/g)?.length ?? 0;
  if (vowels === 0) return true;

  const vowelRatio = vowels / letters.length;
  const longConsonantRun = /[^aeiouy]{5,}/.test(letters);
  if (longConsonantRun && vowelRatio <= 0.25) return true;
  if (vowelRatio < 0.15 && letters.length >= 8) return true;
  return false;
}

/** pg_trgm word_similarity floor for a close typo. Nearest-catalog fallback ignores this. */
export const SEARCH_TYPO_SIMILARITY_FLOOR = 0.35;

function levenshteinWithin(left: string, right: string, maxDistance: number): boolean {
  if (Math.abs(left.length - right.length) > maxDistance) return false;
  if (left === right) return true;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > maxDistance) return false;
    previous = current;
  }

  return previous[right.length] <= maxDistance;
}

/** True when the query is within the typo budget of the title or a window inside it. */
export function isCloseSearchMatch(title: string, query: string): boolean {
  const compactTitle = compactSearchText(title);
  const compactQuery = compactSearchText(query);
  if (!compactQuery || !compactTitle) return false;
  if (compactTitle.includes(compactQuery)) return true;

  const budget = searchTypoBudget(compactQuery.length);
  if (budget <= 0) return false;
  if (levenshteinWithin(compactTitle, compactQuery, budget)) return true;

  const minLength = Math.max(1, compactQuery.length - budget);
  const maxLength = Math.min(compactTitle.length, compactQuery.length + budget);
  for (let length = minLength; length <= maxLength; length += 1) {
    for (let index = 0; index + length <= compactTitle.length; index += 1) {
      if (levenshteinWithin(compactTitle.slice(index, index + length), compactQuery, budget)) {
        return true;
      }
    }
  }

  return false;
}
