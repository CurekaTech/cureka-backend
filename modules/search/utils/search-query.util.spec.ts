import {
  buildSearchSqlPlan,
  normalizeSearchQuery,
  searchQueryTerms,
} from './search-query.util';

describe('search query planning', () => {
  it('normalizes case and repeated whitespace', () => {
    expect(normalizeSearchQuery('  Moisturizer   CREAM  ')).toBe('moisturizer cream');
    expect(searchQueryTerms('Moisturizer   Cream')).toEqual(['moisturizer', 'cream']);
  });

  it('builds an OR recall predicate and ranks full and multi-term matches first', () => {
    const plan = buildSearchSqlPlan(
      'moisturizer cream',
      (parameter) => `product.name ILIKE ${parameter} ESCAPE '!'`,
      'testSearch',
    );

    expect(plan.whereSql).toContain(' OR ');
    expect(plan.whereSql).not.toContain('testSearchTerm0 AND testSearchTerm1');
    expect(plan.rankSql).toContain('WHEN (product.name ILIKE :testSearchTerm0');
    expect(plan.rankSql).toContain(' AND ');
    expect(plan.parameters).toEqual({
      testSearchPhrase: '%moisturizer cream%',
      testSearchTerm0: '%moisturizer%',
      testSearchTerm1: '%cream%',
    });
  });

  it('supports a four-character substring and escapes SQL LIKE wildcards', () => {
    const plan = buildSearchSqlPlan(
      'mois%',
      (parameter) => `product.name ILIKE ${parameter} ESCAPE '!'`,
      'search',
    );

    expect(plan.parameters.searchPhrase).toBe('%mois!%%');
    expect(plan.parameters.searchTerm0).toBe('%mois%');
  });
});