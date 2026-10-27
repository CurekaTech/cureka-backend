import {
  buildSearchSqlPlan,
  normalizeSearchQuery,
  searchQueryTerms,
  searchRelevanceRank,
  sortBySearchRelevance,
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
    expect(plan.rankSql).toContain('product.name ILIKE :testSearchTerm0');
    expect(plan.rankSql).toContain(' AND ');
    expect(plan.rankSql).toContain('COUNT(*)::int FROM products search_term_df');
    expect(plan.parameters).toEqual({
      testSearchPhrase: '%moisturizer cream%',
      testSearchTerm0: '%moisturizer%',
      testSearchTerm1: '%cream%',
    });
  });

  it('ranks a full phrase and a specific term ahead of a shared word', () => {
    const titles = [
      'Back Pain Relief Gel',
      'Back Pain Support Belt',
      'Back Acne Cream',
      'Acne Body Spray',
      'Pain Relief Tablet',
    ];
    const frequency = new Map<string, number>([
      ['back', 3],
      ['acne', 2],
      ['pain', 1],
    ]);

    expect(searchRelevanceRank('Back Acne Cream', 'back acne', frequency)).toBe(0);
    expect(searchRelevanceRank('Acne Body Spray', 'back acne', frequency)).toBeLessThan(
      searchRelevanceRank('Back Pain Relief Gel', 'back acne', frequency),
    );
    expect(searchRelevanceRank('Back Pain Relief Gel', 'back pain', frequency)).toBe(0);
    expect(searchRelevanceRank('Pain Relief Tablet', 'back pain', frequency)).toBeLessThan(
      searchRelevanceRank('Back Acne Cream', 'back pain', frequency),
    );
    expect(sortBySearchRelevance(titles.map((title) => ({ title })), 'back acne').map((item) => item.title)).toEqual([
      'Back Acne Cream',
      'Acne Body Spray',
      'Back Pain Relief Gel',
      'Back Pain Support Belt',
      'Pain Relief Tablet',
    ]);
  });

  it('ranks the product name ahead of a category-only match', () => {
    const plan = buildSearchSqlPlan(
      'back acne',
      (parameter) => `(product.name ILIKE ${parameter} OR category.name ILIKE ${parameter})`,
      'search',
      (parameter) => `product.name ILIKE ${parameter}`,
    );

    expect(plan.whereSql).toContain('category.name');
    expect(plan.rankSql.startsWith('CASE WHEN product.name ILIKE :searchPhrase')).toBe(true);
    expect(plan.rankSql).toContain('COUNT(*)::int FROM products search_term_df');
    expect(plan.rankSql).not.toContain('WHEN (product.name ILIKE :searchTerm0 OR category.name');
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