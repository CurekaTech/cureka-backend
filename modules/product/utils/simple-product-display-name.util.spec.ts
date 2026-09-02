import {
  resolveSimpleVariantDisplayName,
  shouldMirrorSimpleVariantDisplayName,
} from './simple-product-display-name.util';

describe('simple-product-display-name.util', () => {
  describe('shouldMirrorSimpleVariantDisplayName', () => {
    it('mirrors when variant display name is empty', () => {
      expect(shouldMirrorSimpleVariantDisplayName(null, 'Old Product')).toBe(true);
      expect(shouldMirrorSimpleVariantDisplayName('  ', 'Old Product')).toBe(true);
    });

    it('mirrors when variant display name matched previous product name', () => {
      expect(shouldMirrorSimpleVariantDisplayName('Old Product', 'Old Product')).toBe(true);
      expect(shouldMirrorSimpleVariantDisplayName('old product', 'Old Product')).toBe(true);
    });

    it('does not mirror when variant has a custom title', () => {
      expect(
        shouldMirrorSimpleVariantDisplayName('Custom Variant Label', 'Old Product'),
      ).toBe(false);
    });
  });

  describe('resolveSimpleVariantDisplayName', () => {
    it('prefers explicit variant display name', () => {
      expect(resolveSimpleVariantDisplayName('Product A', 'Variant Title')).toBe('Variant Title');
    });

    it('falls back to product name', () => {
      expect(resolveSimpleVariantDisplayName('Product A', undefined)).toBe('Product A');
      expect(resolveSimpleVariantDisplayName('Product A', '   ')).toBe('Product A');
    });
  });
});
