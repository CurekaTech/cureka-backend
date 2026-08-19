import {
  buildBlogLocPath,
  buildBrandLocPath,
  buildCategoryLocPath,
  buildCmsLocPath,
  buildCollectionLocPath,
  buildHealthConcernLocPath,
  buildProductLocPath,
  buildSupportLocPath,
  buildWellnessGoalLocPath,
  dedupeUrlEntries,
  slugifyForUrl,
  splitUrlEntries,
  toStorefrontPath,
} from './sitemap-url.builder';

describe('sitemap-url.builder', () => {
  describe('buildProductLocPath', () => {
    it('prefers productPageUrl over computed permalink', () => {
      expect(
        buildProductLocPath({
          slug: 'zyndet-bar-125gm',
          productPageUrl: '/shop/skin-care/bathing-bars/zyndet-bar-125gm',
          categorySlugPath: ['skin-care'],
        }),
      ).toBe('/shop/skin-care/bathing-bars/zyndet-bar-125gm');
    });

    it('uses category path + product slug when productPageUrl is missing', () => {
      expect(
        buildProductLocPath({
          slug: 'zyndet-bar-125gm',
          categorySlugPath: ['skin-care', 'bathing-bars'],
        }),
      ).toBe('/shop/skin-care/bathing-bars/zyndet-bar-125gm');
    });

    it('falls back to /shop/{slug} when there is no category path', () => {
      expect(
        buildProductLocPath({
          slug: 'zyndet-bar-125gm',
          categorySlugPath: [],
        }),
      ).toBe('/shop/zyndet-bar-125gm');
    });

    it('does not emit SKU-style paths', () => {
      expect(
        buildProductLocPath({
          slug: 'parent-product',
          productPageUrl: '/shop/parent-product',
          categorySlugPath: ['skin-care'],
        }),
      ).not.toContain('SKU');
    });

    it('skips products without slug or public path', () => {
      expect(
        buildProductLocPath({
          slug: '  ',
          productPageUrl: null,
          categorySlugPath: [],
        }),
      ).toBeNull();
    });

    it('extracts pathname from an absolute productPageUrl', () => {
      expect(
        buildProductLocPath({
          slug: 'ignored',
          productPageUrl: 'https://www.cureka.com/shop/vitamin-c/',
          categorySlugPath: [],
        }),
      ).toBe('/shop/vitamin-c');
    });
  });

  it('builds listing and detail loc paths', () => {
    expect(buildCategoryLocPath(['wellness', 'immunity'])).toBe('/product-category/wellness/immunity');
    expect(buildBrandLocPath('himalaya')).toBe('/product-brands/himalaya');
    expect(buildHealthConcernLocPath('Blood Sugar')).toBe('/health-concerns/blood-sugar');
    expect(buildWellnessGoalLocPath('Immune Support')).toBe('/wellness-goals/immune-support');
    expect(buildCollectionLocPath('bestsellers')).toBe('/collections/bestsellers');
    expect(buildBlogLocPath('how-to-care-for-skin')).toBe('/how-to-care-for-skin');
    expect(buildSupportLocPath('return-policy-help')).toBe('/support/articles/return-policy-help');
  });

  it('maps predefined CMS slugs to storefront shortcuts', () => {
    expect(buildCmsLocPath('about-cureka')).toBe('/about');
    expect(buildCmsLocPath('privacy-policy')).toBe('/policies/privacy');
    expect(buildCmsLocPath('custom-page')).toBe('/policies/custom-page');
    expect(buildCmsLocPath('')).toBeNull();
  });

  it('slugifies like home-section titles', () => {
    expect(slugifyForUrl('Immune Support!')).toBe('immune-support');
  });

  it('dedupes identical loc paths', () => {
    expect(
      dedupeUrlEntries([
        { locPath: '/shop/a' },
        { locPath: '/shop/a' },
        { locPath: '/shop/b' },
      ]).map((entry) => entry.locPath),
    ).toEqual(['/shop/a', '/shop/b']);
  });

  it('splits 50,001 URLs into two product files', () => {
    const entries = Array.from({ length: 50_001 }, (_, index) => ({
      locPath: `/shop/p-${index}`,
    }));
    const chunks = splitUrlEntries(entries, 50_000);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(50_000);
    expect(chunks[1]).toHaveLength(1);
  });

  it('normalizes storefront paths', () => {
    expect(toStorefrontPath('/shop/foo/')).toBe('/shop/foo');
    expect(toStorefrontPath('')).toBeNull();
  });
});
