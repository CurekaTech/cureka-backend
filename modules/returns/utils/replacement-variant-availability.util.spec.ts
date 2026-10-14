import { assessReplacementVariant } from './replacement-variant-availability.util';

const variant = {
  status: 'active',
  outOfStock: false,
  stock: 2,
  inCurekaInventory: false,
  product: { status: 'published', productType: 'simple' },
};

describe('assessReplacementVariant', () => {
  it('accepts an active in-stock variant of a published product, including another product', () => {
    expect(assessReplacementVariant(variant, { requireBundle: false })).toBe('OK');
  });

  it('rejects a missing variant', () => {
    expect(assessReplacementVariant(null, { requireBundle: false })).toBe('NOT_FOUND');
  });

  it('rejects an unpublished product and an out-of-stock variant', () => {
    expect(
      assessReplacementVariant(
        { ...variant, product: { status: 'draft', productType: 'simple' } },
        { requireBundle: false },
      ),
    ).toBe('UNAVAILABLE');
    expect(assessReplacementVariant({ ...variant, outOfStock: true }, { requireBundle: false })).toBe(
      'UNAVAILABLE',
    );
    expect(assessReplacementVariant({ ...variant, status: 'inactive' }, { requireBundle: false })).toBe(
      'UNAVAILABLE',
    );
  });

  it('requires a bundle product when the order line is a bundle', () => {
    expect(assessReplacementVariant(variant, { requireBundle: true })).toBe('UNAVAILABLE');
    expect(
      assessReplacementVariant(
        { ...variant, product: { status: 'published', productType: 'bundle' } },
        { requireBundle: true },
      ),
    ).toBe('OK');
  });
});
