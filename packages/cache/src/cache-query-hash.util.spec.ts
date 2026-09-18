import { buildQueryCacheHash, normalizeCacheFilterValue } from './cache-query-hash.util';

describe('normalizeCacheFilterValue', () => {
  it('keeps primitives and treats empty as absent', () => {
    expect(normalizeCacheFilterValue(undefined)).toBe('_');
    expect(normalizeCacheFilterValue(null)).toBe('_');
    expect(normalizeCacheFilterValue('')).toBe('_');
    expect(normalizeCacheFilterValue('  ')).toBe('_');
    expect(normalizeCacheFilterValue(0)).toBe('0');
    expect(normalizeCacheFilterValue(false)).toBe('false');
    expect(normalizeCacheFilterValue('brand-a')).toBe('brand-a');
  });

  it('does not collapse object criteria to [object Object]', () => {
    const tablet = normalizeCacheFilterValue([
      { categoryFilterId: 'f1', values: ['Tablet'] },
    ]);
    const oily = normalizeCacheFilterValue([
      { categoryFilterId: 'f2', values: ['Oily'] },
    ]);
    expect(tablet).not.toContain('[object Object]');
    expect(oily).not.toContain('[object Object]');
    expect(tablet).not.toEqual(oily);
  });

  it('is order-independent for criteria arrays, object keys, and values', () => {
    const a = normalizeCacheFilterValue([
      { values: ['Tablet', 'Cream'], categoryFilterId: 'f1' },
      { categoryFilterId: 'f2', values: ['Oily'] },
    ]);
    const b = normalizeCacheFilterValue([
      { categoryFilterId: 'f2', values: ['Oily'] },
      { categoryFilterId: 'f1', values: ['Cream', 'Tablet'] },
    ]);
    expect(a).toEqual(b);
  });
});

describe('buildQueryCacheHash', () => {
  it('keeps Brand + Formulation distinct from Brand + Skin Type', () => {
    const brandPlusFormulation = buildQueryCacheHash({
      brandId: 'brand-a',
      brandSlug: 'brand-a',
      categoryFilterCriteria: [{ categoryFilterId: 'formulation', values: ['Tablet'] }],
      page: 1,
    });
    const brandPlusSkinType = buildQueryCacheHash({
      brandId: 'brand-a',
      brandSlug: 'brand-a',
      categoryFilterCriteria: [{ categoryFilterId: 'skin-type', values: ['Oily'] }],
      page: 1,
    });
    expect(brandPlusFormulation).not.toEqual(brandPlusSkinType);
  });

  it('keeps Brand A + CF distinct from Brand B + same CF', () => {
    const criteria = [{ categoryFilterId: 'formulation', values: ['Tablet'] }];
    const brandA = buildQueryCacheHash({
      brandId: 'brand-a',
      brandSlug: 'brand-a',
      categoryFilterCriteria: criteria,
      page: 1,
    });
    const brandB = buildQueryCacheHash({
      brandId: 'brand-b',
      brandSlug: 'brand-b',
      categoryFilterCriteria: criteria,
      page: 1,
    });
    expect(brandA).not.toEqual(brandB);
  });

  it('keeps raw categoryFilters JSON strings distinct', () => {
    const a = buildQueryCacheHash({
      brandSlug: 'brand-a',
      categoryFilters: JSON.stringify([
        { categoryFilterRefId: 'FOR2026', values: ['Tablet'] },
      ]),
    });
    const b = buildQueryCacheHash({
      brandSlug: 'brand-a',
      categoryFilters: JSON.stringify([
        { categoryFilterRefId: 'SKN2026', values: ['Oily'] },
      ]),
    });
    expect(a).not.toEqual(b);
  });

  it('treats recommendation variantIds as order-independent', () => {
    const a = buildQueryCacheHash({
      variantIds: ['b-uuid', 'a-uuid'],
      page: 1,
      limit: 10,
    });
    const b = buildQueryCacheHash({
      variantIds: ['a-uuid', 'b-uuid'],
      page: 1,
      limit: 10,
    });
    expect(a).toEqual(b);
  });
});
