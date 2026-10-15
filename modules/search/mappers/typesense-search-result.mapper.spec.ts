import { SEARCH_ENTITY_TYPES } from '../constants/search-entity-type.constant';
import {
  mapTypesenseDocumentToSearchResult,
  titleMatchesSearchQuery,
} from './typesense-search-result.mapper';

describe('mapTypesenseDocumentToSearchResult', () => {
  it('omits variantId and nested full product cards', () => {
    const result = mapTypesenseDocumentToSearchResult({
      entityType: SEARCH_ENTITY_TYPES.PRODUCT,
      refId: 'PRD1',
      name: 'Vitamin C',
      slug: 'vitamin-c',
      variantId: 'var-1',
      variantSlug: 'vitamin-c-500',
      productPageUrl: '/shop/vitamin-c/',
      permalink: '/shop/nutrition/vitamin-c',
    });

    expect(result).toEqual({
      entityType: SEARCH_ENTITY_TYPES.PRODUCT,
      title: 'Vitamin C',
      slug: 'vitamin-c-500',
      refId: 'PRD1',
      productPageUrl: '/shop/vitamin-c/',
      permalink: '/shop/nutrition/vitamin-c',
      product: { permalink: '/shop/nutrition/vitamin-c' },
    });
    expect(result).not.toHaveProperty('variantId');
  });
});

describe('titleMatchesSearchQuery', () => {
  it.each([
    ['Face Moisturizer', 'mois'],
    ['Cream Cleanser', 'crea'],
    ['Face Moisturizer', 'xyzq moisturizer'],
    ['Face Moisturizer', 'MOISTURIZER CREAM'],
    ['Face Moisturizer', 'face    moisturizer'],
  ])('matches a meaningful query term in %s for %s', (title, query) => {
    expect(titleMatchesSearchQuery(title, query)).toBe(true);
  });

  it('does not match unrelated short or absent terms', () => {
    expect(titleMatchesSearchQuery('Moisturizer', 'xyzq cream')).toBe(false);
  });
});
