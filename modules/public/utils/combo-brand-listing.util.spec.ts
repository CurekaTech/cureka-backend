import {
  COMBO_BRAND_SLUG,
  isComboBrandSlug,
  resolvePublicProductTypeForListing,
} from './combo-brand-listing.util';
import { ProductType } from '@modules/product/enums/product-type.enum';

describe('combo-brand-listing.util', () => {
  it('detects combo brand slug case-insensitively', () => {
    expect(isComboBrandSlug('combo')).toBe(true);
    expect(isComboBrandSlug('Combo')).toBe(true);
    expect(isComboBrandSlug('other')).toBe(false);
    expect(COMBO_BRAND_SLUG).toBe('combo');
  });

  it('forces bundle productType for single combo brandSlug', () => {
    expect(
      resolvePublicProductTypeForListing({
        brandSlug: 'combo',
        productType: ProductType.SIMPLE,
      }),
    ).toBe(ProductType.BUNDLE);
  });

  it('keeps explicit productType for non-combo brands', () => {
    expect(
      resolvePublicProductTypeForListing({
        brandSlug: 'similac',
        productType: ProductType.SIMPLE,
      }),
    ).toBe(ProductType.SIMPLE);
  });

  it('does not force bundle when multiple brand slugs are selected', () => {
    expect(
      resolvePublicProductTypeForListing({
        brandSlugs: ['combo', 'similac'],
        productType: undefined,
      }),
    ).toBeUndefined();
  });
});
