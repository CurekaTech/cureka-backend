export interface SearchSqlPlan {
  normalizedQuery: string;
  terms: string[];
  whereSql: string;
  rankSql: string;
  parameters: Record<string, string>;
}

/** Missing query terms outrank how common a matched term is. */
const SEARCH_RANK_TERM_WEIGHT = 100_000;
/** A category, brand, or SKU hit sorts after any product-name term hit. */
const SEARCH_RANK_NO_NAME_PENALTY = 50_000_000;

export const normalizeSearchQuery = (query: string): string =>
  query.trim().toLowerCase().replace(/\s+/g, ' ');

export const searchQueryTerms = (query: string): string[] =>
  [...new Set(
    normalizeSearchQuery(query)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 4),
  )];

export const escapeSearchLikePattern = (value: string): string =>
  value.replace(/[!%_]/g, '!$&');

const termDocumentFrequencySql = (patternParameter: string): string =>
  `(SELECT COUNT(*)::int FROM products search_term_df WHERE search_term_df.deleted_at IS NULL AND search_term_df.status = 'published' AND search_term_df.name ILIKE ${patternParameter} ESCAPE '!')`;

/**
 * Lower is better.
 * Phrase and full name coverage stay ahead of a hit on one common word.
 * `documentFrequency` is how often each term appears in the candidate titles.
 */
export const searchRelevanceRank = (
  title: string,
  query: string,
  documentFrequency: ReadonlyMap<string, number>,
): number => {
  const normalizedTitle = title.toLowerCase();
  const phrase = normalizeSearchQuery(query);
  const terms = searchQueryTerms(phrase);
  if (phrase && normalizedTitle.includes(phrase)) return 0;

  const matched = terms.filter((term) => normalizedTitle.includes(term));
  if (terms.length > 0 && matched.length === terms.length) return 1;

  const missed = terms.length - matched.length;
  const commonness = matched.reduce((sum, term) => sum + (documentFrequency.get(term) ?? 0), 0);
  const noNamePenalty = matched.length === 0 ? SEARCH_RANK_NO_NAME_PENALTY : 0;
  return 2 + missed * SEARCH_RANK_TERM_WEIGHT + noNamePenalty + commonness;
};

/** Stable reorder. One-word queries keep the order the search engine already returned. */
export const sortBySearchRelevance = <T extends { title: string }>(
  items: readonly T[],
  query: string,
): T[] => {
  const terms = searchQueryTerms(query);
  if (terms.length < 2 || items.length < 2) return [...items];

  const titles = items.map((item) => item.title.toLowerCase());
  const documentFrequency = new Map<string, number>(
    terms.map((term) => [term, titles.filter((title) => title.includes(term)).length]),
  );

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rank =
        searchRelevanceRank(left.item.title, query, documentFrequency) -
        searchRelevanceRank(right.item.title, query, documentFrequency);
      return rank || left.index - right.index;
    })
    .map(({ item }) => item);
};

/**
 * Build bound patterns and a relevance score shared by PostgreSQL search paths.
 * `matchTerm` is recall (name, brand, category, SKU). `nameMatch` is the rank
 * signal, so a shared category word cannot outrank the product name.
 */
export const buildSearchSqlPlan = (
  query: string,
  matchTerm: (patternParameter: string) => string,
  parameterPrefix: string,
  nameMatch?: (patternParameter: string) => string,
): SearchSqlPlan => {
  const normalizedQuery = normalizeSearchQuery(query);
  const terms = searchQueryTerms(normalizedQuery);
  const phraseParameter = `${parameterPrefix}Phrase`;
  const phraseMatch = matchTerm(`:${phraseParameter}`);
  const parameters: Record<string, string> = {
    [phraseParameter]: `%${escapeSearchLikePattern(normalizedQuery)}%`,
  };
  const termParameters = terms.map((term, index) => {
    const parameter = `${parameterPrefix}Term${index}`;
    parameters[parameter] = `%${escapeSearchLikePattern(term)}%`;
    return `:${parameter}`;
  });
  const termMatches = termParameters.map((parameter) => matchTerm(parameter));
  const rankMatch = nameMatch ?? matchTerm;
  const phraseRankMatch = rankMatch(`:${phraseParameter}`);
  const rankedTermMatches = termParameters.map((parameter) => rankMatch(parameter));

  const anyTermMatches = termMatches.length ? termMatches.join(' OR ') : 'FALSE';
  const allTermsMatch = rankedTermMatches.length ? rankedTermMatches.join(' AND ') : 'FALSE';
  const matchedTermCount = rankedTermMatches.length
    ? rankedTermMatches.map((match) => `(CASE WHEN ${match} THEN 1 ELSE 0 END)`).join(' + ')
    : '0';
  const specificity = rankedTermMatches.length
    ? rankedTermMatches
        .map(
          (match, index) =>
            `(CASE WHEN ${match} THEN ${termDocumentFrequencySql(termParameters[index])} ELSE 0 END)`,
        )
        .join(' + ')
    : '0';
  const missedTerms = `(${terms.length} - (${matchedTermCount}))`;
  const noNamePenalty = `(CASE WHEN (${matchedTermCount}) = 0 THEN ${SEARCH_RANK_NO_NAME_PENALTY} ELSE 0 END)`;
  const rankSql = terms.length
    ? `CASE WHEN ${phraseRankMatch} THEN 0 WHEN (${allTermsMatch}) THEN 1 ELSE 2 + ${missedTerms} * ${SEARCH_RANK_TERM_WEIGHT} + ${noNamePenalty} + (${specificity}) END`
    : `CASE WHEN ${phraseRankMatch} THEN 0 ELSE 1 END`;

  return {
    normalizedQuery,
    terms,
    whereSql: `(${phraseMatch} OR (${anyTermMatches}))`,
    rankSql,
    parameters,
  };
};