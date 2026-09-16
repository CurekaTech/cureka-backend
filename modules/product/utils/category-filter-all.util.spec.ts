import {
  CATEGORY_FILTER_ALL_VALUE,
  expandCategoryFilterAllCriteria,
  ensureCategoryFilterAllOption,
  hasCategoryFilterAllSentinel,
  isCategoryFilterAllSentinel,
} from './category-filter-all.util';
import { IResolvedCategoryFilterCriterion } from './category-filter-query.util';

describe('category-filter-all.util', () => {
  it('detects All and All Skin Types sentinels', () => {
    expect(isCategoryFilterAllSentinel('All')).toBe(true);
    expect(isCategoryFilterAllSentinel('all')).toBe(true);
    expect(isCategoryFilterAllSentinel('All Skin Types')).toBe(true);
    expect(isCategoryFilterAllSentinel('All Hair Types')).toBe(true);
    expect(isCategoryFilterAllSentinel('Dry')).toBe(false);
    expect(isCategoryFilterAllSentinel('Overall')).toBe(false);
  });

  it('expands All to every master value for that filter', () => {
    const criteria: IResolvedCategoryFilterCriterion[] = [
      { categoryFilterId: 'skin', values: ['All'] },
      { categoryFilterId: 'hair', values: ['Oily'] },
    ];
    const masters = new Map<string, string[]>([
      ['skin', ['All Skin Types', 'Dry', 'Oily', 'Sensitive']],
      ['hair', ['Straight', 'Oily']],
    ]);

    expect(expandCategoryFilterAllCriteria(criteria, masters)).toEqual([
      {
        categoryFilterId: 'skin',
        values: ['All Skin Types', 'Dry', 'Oily', 'Sensitive'],
      },
      { categoryFilterId: 'hair', values: ['Oily'] },
    ]);
  });

  it('expands legacy All Skin Types the same way', () => {
    const criteria: IResolvedCategoryFilterCriterion[] = [
      { categoryFilterId: 'skin', values: ['All Skin Types'] },
    ];
    const masters = new Map<string, string[]>([['skin', ['All Skin Types', 'Dry', 'Oily']]]);

    expect(expandCategoryFilterAllCriteria(criteria, masters)?.[0]?.values).toEqual([
      'All Skin Types',
      'Dry',
      'Oily',
    ]);
    expect(hasCategoryFilterAllSentinel(['All Skin Types'])).toBe(true);
  });

  it('keeps literal All when master values are empty', () => {
    const criteria: IResolvedCategoryFilterCriterion[] = [
      { categoryFilterId: 'skin', values: ['All'] },
    ];
    expect(expandCategoryFilterAllCriteria(criteria, new Map())).toEqual(criteria);
  });

  it('prepends synthetic All in facet value lists', () => {
    expect(ensureCategoryFilterAllOption(['Dry', 'Oily'])).toEqual(['All', 'Dry', 'Oily']);
    expect(ensureCategoryFilterAllOption(['All Skin Types', 'Dry'])).toEqual(['All', 'Dry']);
    expect(CATEGORY_FILTER_ALL_VALUE).toBe('All');
  });
});
