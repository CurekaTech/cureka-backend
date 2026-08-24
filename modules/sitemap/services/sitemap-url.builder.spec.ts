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
  resolveProductSitemapLoc,
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

    it('uses only product_page_url when it differs from the slug permalink', () => {
      expect(
        buildProductLocPaths({
          slug: 'zyndet-bar-125gm-1',
          productPageUrl: '/shop/skin-care/bathing-bars/zyndet-bar-125gm',
          categorySlugPath: ['skin-care', 'bathing-bars'],
        }),
      ).toEqual(['/shop/skin-care/bathing-bars/zyndet-bar-125gm']);
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

  describe('resolveProductSitemapLoc', () => {
    const deepCategory = [
      'healthcare-devices',
      'supports-splints-braces',
      'cervical-neck-support',
    ];
    const productSlug = 'flamingo-cervical-orthosis-philadelphia-collar-xl';

    it('uses configured product_page_url and ignores category hierarchy', () => {
      const resolved = resolveProductSitemapLoc({
        slug: productSlug,
        productPageUrl:
          '/shop/pain-relief/flamingo-cervical-orthosis-philadelphia-collar-xl/',
        singleProductUrl: '/shop/ignored-single/',
        categorySlugPath: deepCategory,
      });
      expect(resolved).toEqual({
        locPath: '/shop/pain-relief/flamingo-cervical-orthosis-philadelphia-collar-xl',
        source: 'CONFIGURED_VARIANT_URL',
      });
    });

    it('falls back to dynamic URL when product_page_url is missing', () => {
      expect(
        resolveProductSitemapLoc({
          slug: productSlug,
          productPageUrl: null,
          categorySlugPath: ['pain-relief'],
        }),
      ).toEqual({
        locPath: `/shop/pain-relief/${productSlug}`,
        source: 'DYNAMIC_FALLBACK',
      });
    });

    it('falls back when product_page_url is empty or whitespace', () => {
      expect(
        resolveProductSitemapLoc({
          slug: productSlug,
          productPageUrl: '',
          categorySlugPath: ['pain-relief'],
        })?.source,
      ).toBe('DYNAMIC_FALLBACK');
      expect(
        resolveProductSitemapLoc({
          slug: productSlug,
          productPageUrl: '   ',
          categorySlugPath: ['pain-relief'],
        })?.source,
      ).toBe('DYNAMIC_FALLBACK');
    });

    it('does not use singleProductUrl when configured product_page_url exists', () => {
      const resolved = resolveProductSitemapLoc({
        slug: productSlug,
        productPageUrl: '/shop/pain-relief/configured/',
        singleProductUrl: '/shop/pain-relief/from-single/',
        categorySlugPath: deepCategory,
      });
      expect(resolved?.locPath).toBe('/shop/pain-relief/configured');
      expect(resolved?.source).toBe('CONFIGURED_VARIANT_URL');
    });

    it('dedupes identical final locs across configured + dynamic variants', () => {
      const configured = resolveProductSitemapLoc({
        slug: 'product-a',
        productPageUrl: '/shop/pain-relief/product-a/',
        categorySlugPath: ['pain-relief'],
      });
      const dynamic = resolveProductSitemapLoc({
        slug: 'product-a',
        productPageUrl: null,
        categorySlugPath: ['pain-relief'],
      });
      expect(configured?.locPath).toBe('/shop/pain-relief/product-a');
      expect(dynamic?.locPath).toBe('/shop/pain-relief/product-a');

      const seen = new Set<string>();
      const emit = (locPath: string | undefined): boolean => {
        if (!locPath || seen.has(locPath)) return false;
        seen.add(locPath);
        return true;
      };
      expect(emit(configured?.locPath)).toBe(true);
      expect(emit(dynamic?.locPath)).toBe(false);
      expect([...seen]).toEqual(['/shop/pain-relief/product-a']);
    });

    it('keeps distinct variant URLs separate', () => {
      const xl = resolveProductSitemapLoc({
        slug: 'product-a',
        productPageUrl: '/shop/pain-relief/product-a-xl/',
        categorySlugPath: [],
      });
      const child = resolveProductSitemapLoc({
        slug: 'product-a',
        productPageUrl: '/shop/pain-relief/product-a-child/',
        categorySlugPath: [],
      });
      const seen = new Set<string>();
      for (const loc of [xl?.locPath, child?.locPath]) {
        if (loc && !seen.has(loc)) seen.add(loc);
      }
      expect([...seen]).toEqual([
        '/shop/pain-relief/product-a-xl',
        '/shop/pain-relief/product-a-child',
      ]);
    });

    it('dedupes the same locPath across simulated DB batches', () => {
      const seen = new Set<string>();
      const batches = [
        ['/shop/pain-relief/product-a'],
        ['/shop/pain-relief/product-a', '/shop/pain-relief/other'],
      ];
      const emitted: string[] = [];
      for (const batch of batches) {
        for (const locPath of batch) {
          if (seen.has(locPath)) continue;
          seen.add(locPath);
          emitted.push(locPath);
        }
      }
      expect(emitted).toEqual([
        '/shop/pain-relief/product-a',
        '/shop/pain-relief/other',
      ]);
    });

    it('includes configured URL plus a different dynamic fallback', () => {
      const configured = resolveProductSitemapLoc({
        slug: 'parent',
        productPageUrl: '/shop/pain-relief/configured-xl/',
        categorySlugPath: ['healthcare-devices'],
      });
      const dynamic = resolveProductSitemapLoc({
        slug: 'parent',
        productPageUrl: null,
        categorySlugPath: ['healthcare-devices'],
      });
      expect(configured).toEqual({
        locPath: '/shop/pain-relief/configured-xl',
        source: 'CONFIGURED_VARIANT_URL',
      });
      expect(dynamic).toEqual({
        locPath: '/shop/healthcare-devices/parent',
        source: 'DYNAMIC_FALLBACK',
      });
      expect(configured?.locPath).not.toBe(dynamic?.locPath);
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
