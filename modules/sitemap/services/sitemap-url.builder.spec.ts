import {
  buildBlogLocPath,
  buildBrandLocPath,
  buildCategoryLocPath,
  buildCmsLocPath,
  buildCollectionLocPath,
  buildHealthConcernLocPath,
  buildProductLocPath,
  buildProductLocPaths,
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

    it('emits slug permalink and product_page_url when they differ', () => {
      expect(
        buildProductLocPaths({
          slug: 'zyndet-bar-125gm-1',
          productPageUrl: '/shop/skin-care/bathing-bars/zyndet-bar-125gm',
          categorySlugPath: ['skin-care', 'bathing-bars'],
        }),
      ).toEqual([
        '/shop/skin-care/bathing-bars/zyndet-bar-125gm',
        '/shop/skin-care/bathing-bars/zyndet-bar-125gm-1',
      ]);
    });

    it('emits only the slug permalink when product_page_url is empty', () => {
      expect(
        buildProductLocPaths({
          slug: 'vitamin-c-serum',
          productPageUrl: null,
          categorySlugPath: ['skin-care'],
        }),
      ).toEqual(['/shop/skin-care/vitamin-c-serum']);
    });

    it('emits only product_page_url when slug is missing', () => {
      expect(
        buildProductLocPaths({
          slug: '',
          productPageUrl: '/shop/vitamin-c/',
          categorySlugPath: ['skin-care'],
        }),
      ).toEqual(['/shop/vitamin-c']);
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
    expect(buildBrandLocPath('la-roche-posay')).toBe('/product-brands/la-roche-posay');
    expect(buildHealthConcernLocPath('blood-sugar')).toBe('/health-concerns/blood-sugar');
    expect(buildWellnessGoalLocPath('Digestion & Gut Health')).toBe(
      '/wellness-goals/digestion-and-gut-health',
    );
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

  it('slugifies like storefront listing pages (`&` becomes `and`)', () => {
    expect(slugifyForUrl('Immune Support!')).toBe('immune-support');
    expect(slugifyForUrl('Digestion & Gut Health')).toBe('digestion-and-gut-health');
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
