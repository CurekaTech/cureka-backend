import { ProductType } from '../enums/product-type.enum';
import {
  resolveBulkImportVariantUrlFields,
  resolveExportedProductPageUrl,
  resolveExportedSingleProductUrl,
} from './bulk-upload-url.util';

const product = (overrides: Record<string, unknown> = {}) =>
  ({
    slug: 'knee-support',
    singleProductUrl: 'https://www.cureka.com/shop/knee-support',
    productType: ProductType.SIMPLE,
    category: { slug: 'pain-relief' },
    subCategory: { slug: 'knee-support' },
    subSubCategory: null,
    subSubSubCategory: null,
    ...overrides,
  }) as any;

const variant = (overrides: Record<string, unknown> = {}) =>
  ({
    slug: 'knee-support-medium',
    productPageUrl: null,
    singleProductUrl: null,
    ...overrides,
  }) as any;

describe('resolveExportedSingleProductUrl', () => {
  it('uses the product-level single product URL', () => {
    expect(resolveExportedSingleProductUrl(product(), variant())).toBe(
      'https://www.cureka.com/shop/knee-support',
    );
  });

  it('falls back to the variant field without copying product_page_url', () => {
    expect(
      resolveExportedSingleProductUrl(
        product({ singleProductUrl: null }),
        variant({
          singleProductUrl: '/shop/variant-legacy',
          productPageUrl: '/shop/should-not-copy',
        }),
      ),
    ).toBe('/shop/variant-legacy');
  });
});

describe('resolveExportedProductPageUrl', () => {
  it('uses the stored variant product_page_url when present', () => {
    expect(
      resolveExportedProductPageUrl(
        product(),
        variant({ productPageUrl: '/shop/pain-relief/knee-support/knee-support-medium' }),
      ),
    ).toBe('/shop/pain-relief/knee-support/knee-support-medium');
  });

  it('does not copy the parent URL onto variable variants', () => {
    expect(
      resolveExportedProductPageUrl(
        product({ productType: ProductType.VARIABLE }),
        variant({ slug: 'knee-support-large', productPageUrl: null, singleProductUrl: null }),
      ),
    ).toBe('/shop/pain-relief/knee-support/knee-support-large');
  });

  it('uses parent single product URL as live fallback for simple products', () => {
    expect(
      resolveExportedProductPageUrl(
        product({
          productType: ProductType.SIMPLE,
          singleProductUrl: '/shop/simple-live',
        }),
        variant({ slug: 'simple-slug', productPageUrl: null, singleProductUrl: null }),
      ),
    ).toBe('/shop/simple-live');
  });
});

describe('resolveBulkImportVariantUrlFields', () => {
  it('applies sheet Product Page URL on an existing product and ignores lookup', () => {
    expect(
      resolveBulkImportVariantUrlFields({
        sheetProductPageUrl: '/shop/new-url',
        sheetSlug: undefined,
        lookupProductPageUrl: '/shop/lookup-url',
        lookupSlug: 'lookup-slug',
        isExistingProduct: true,
      }),
    ).toEqual({ productPageUrl: '/shop/new-url' });
  });

  it('does not invent URL or slug values when the sheet left them blank on update', () => {
    expect(
      resolveBulkImportVariantUrlFields({
        lookupProductPageUrl: '/shop/lookup-url',
        lookupSlug: 'lookup-slug',
        isExistingProduct: true,
      }),
    ).toEqual({});
  });

  it('uses lookup only when creating a product and the sheet URL is blank', () => {
    expect(
      resolveBulkImportVariantUrlFields({
        lookupProductPageUrl: '/shop/lookup-url',
        lookupSlug: 'lookup-slug',
        isExistingProduct: false,
      }),
    ).toEqual({ productPageUrl: '/shop/lookup-url', slug: 'lookup-slug' });
  });
});
