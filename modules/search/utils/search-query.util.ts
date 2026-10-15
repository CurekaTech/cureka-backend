export interface SearchSqlPlan {
  normalizedQuery: string;
  terms: string[];
  whereSql: string;
  rankSql: string;
  parameters: Record<string, string>;
}

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

/** Build bound patterns and a relevance score shared by PostgreSQL search paths. */
export const buildSearchSqlPlan = (
  query: string,
  matchTerm: (patternParameter: string) => string,
  parameterPrefix: string,
): SearchSqlPlan => {
  const normalizedQuery = normalizeSearchQuery(query);
  const terms = searchQueryTerms(normalizedQuery);
  const phraseParameter = `${parameterPrefix}Phrase`;
  const phraseMatch = matchTerm(`:${phraseParameter}`);
  const parameters: Record<string, string> = {
    [phraseParameter]: `%${escapeSearchLikePattern(normalizedQuery)}%`,
  };
  const termMatches = terms.map((term, index) => {
    const parameter = `${parameterPrefix}Term${index}`;
    parameters[parameter] = `%${escapeSearchLikePattern(term)}%`;
    return matchTerm(`:${parameter}`);
  });

  const anyTermMatches = termMatches.length ? termMatches.join(' OR ') : 'FALSE';
  const allTermsMatch = termMatches.length ? termMatches.join(' AND ') : 'FALSE';
  const matchedTermCount = termMatches.length
    ? termMatches.map((match) => `(CASE WHEN ${match} THEN 1 ELSE 0 END)`).join(' + ')
    : '0';

  return {
    normalizedQuery,
    terms,
    whereSql: `(${phraseMatch} OR (${anyTermMatches}))`,
    rankSql: `CASE WHEN ${phraseMatch} THEN 0 WHEN (${allTermsMatch}) THEN 1 ELSE ${
      terms.length + 2
    } - (${matchedTermCount}) END`,
    parameters,
  };
};