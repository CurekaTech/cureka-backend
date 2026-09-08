import { shouldRegenerateVariantSlugFromProductChange } from './variant-slug-sync.util';

describe('variant-slug-sync.util', () => {
  it('regenerates when the current slug is the old auto-generated base slug', () => {
    expect(
      shouldRegenerateVariantSlugFromProductChange({
        currentSlug: 'face-wash',
        previousProductSlug: 'face-wash',
        nextProductSlug: 'gentle-face-wash',
        attributeValues: [],
        sku: 'SKU123',
      }),
    ).toBe(true);
  });

  it('regenerates when the current slug matches the old attribute-based auto slug', () => {
    expect(
      shouldRegenerateVariantSlugFromProductChange({
        currentSlug: 'face-wash-100ml',
        previousProductSlug: 'face-wash',
        nextProductSlug: 'gentle-face-wash',
        attributeValues: ['100ml'],
        sku: 'SKU123',
      }),
    ).toBe(true);
  });

  it('regenerates when the current slug matches the legacy SKU-appended format', () => {
    expect(
      shouldRegenerateVariantSlugFromProductChange({
        currentSlug: 'face-wash-sku123',
        previousProductSlug: 'face-wash',
        nextProductSlug: 'gentle-face-wash',
        attributeValues: [],
        sku: 'SKU123',
      }),
    ).toBe(true);
  });

  it('preserves a custom slug on product-title edits', () => {
    expect(
      shouldRegenerateVariantSlugFromProductChange({
        currentSlug: 'summer-special-face-wash',
        previousProductSlug: 'face-wash',
        nextProductSlug: 'gentle-face-wash',
        attributeValues: [],
        sku: 'SKU123',
      }),
    ).toBe(false);
  });

  it('does nothing when the product slug has not changed', () => {
    expect(
      shouldRegenerateVariantSlugFromProductChange({
        currentSlug: 'face-wash',
        previousProductSlug: 'face-wash',
        nextProductSlug: 'face-wash',
        attributeValues: [],
        sku: 'SKU123',
      }),
    ).toBe(false);
  });
});
