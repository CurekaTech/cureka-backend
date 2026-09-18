import { SEARCH_ENTITY_TYPES } from '../constants/search-entity-type.constant';
import { mapTypesenseDocumentToSearchResult } from './typesense-search-result.mapper';

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
