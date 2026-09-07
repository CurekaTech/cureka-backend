import {
  PublicListingContextType,
  PublicProductFacet,
} from '../enums/public-listing-context-type.enum';
import {
  inferListingContextType,
  resolveFacetOmit,
  resolveLockedFacetKeys,
} from './product-listing-context.util';

describe('product-listing-context.util', () => {
  it('infers a single landing context', () => {
    expect(inferListingContextType({ healthConcernSlug: 'hair-fall' })).toBe(
      PublicListingContextType.HEALTH_CONCERN,
    );
    expect(inferListingContextType({ categorySlug: 'hair-care' })).toBe(
      PublicListingContextType.CATEGORY,
    );
    expect(inferListingContextType({ search: 'shampoo' })).toBe(PublicListingContextType.SEARCH);
  });

  it('infers mixed when multiple listing dimensions are present', () => {
    expect(
      inferListingContextType({
        categorySlug: 'hair-care',
        healthConcernSlug: 'hair-fall',
      }),
    ).toBe(PublicListingContextType.MIXED);
  });

  it('locks health concern and does not omit it from brand/category facets', () => {
    const locked = resolveLockedFacetKeys({
      contextType: PublicListingContextType.HEALTH_CONCERN,
      query: { healthConcernSlug: 'hair-fall' },
    });
    expect([...locked]).toEqual(['healthConcern']);
    expect(resolveFacetOmit(PublicProductFacet.BRANDS, locked)).toEqual(['brand']);
    expect(resolveFacetOmit(PublicProductFacet.CATEGORIES, locked)).toEqual(['category']);
    expect(resolveFacetOmit(PublicProductFacet.PRICE, locked)).toEqual(['price']);
  });

  it('does not omit a locked brand or category when computing that facet', () => {
    const categoryLocked = resolveLockedFacetKeys({
      contextType: PublicListingContextType.CATEGORY,
      query: { categorySlug: 'hair-care', brandSlug: 'xyz' },
    });
    expect(resolveFacetOmit(PublicProductFacet.CATEGORIES, categoryLocked)).toEqual([]);
    expect(resolveFacetOmit(PublicProductFacet.BRANDS, categoryLocked)).toEqual(['brand']);

    const brandLocked = resolveLockedFacetKeys({
      contextType: PublicListingContextType.BRAND,
      query: { brandSlug: 'xyz' },
    });
    expect(resolveFacetOmit(PublicProductFacet.BRANDS, brandLocked)).toEqual([]);
    expect(resolveFacetOmit(PublicProductFacet.CATEGORIES, brandLocked)).toEqual(['category']);
  });

  it('omits only the current category-filter group', () => {
    const locked = resolveLockedFacetKeys({
      contextType: PublicListingContextType.CATEGORY,
      query: { categorySlug: 'hair-care' },
    });
    expect(resolveFacetOmit('categoryFilter:filter-1', locked)).toEqual(['categoryFilter:filter-1']);
  });

  it('honours lockedFacets override for mixed landings', () => {
    const locked = resolveLockedFacetKeys({
      contextType: PublicListingContextType.MIXED,
      lockedFacets: 'category,healthConcern',
      query: { categorySlug: 'hair-care', healthConcernSlug: 'hair-fall', brandSlug: 'xyz' },
    });
    expect(locked.has('category')).toBe(true);
    expect(locked.has('healthConcern')).toBe(true);
    expect(locked.has('brand')).toBe(false);
  });
});
