import {
  buildNewProductGoogleMerchantId,
  buildTitlePrefix4,
  extractExternalProductIdFromSheetId,
  extractSkuNumberPart,
  resolveGoogleMerchantItemId,
} from './google-merchant-id.util';

describe('google-merchant-id.util', () => {
  it('extracts product id from sheet id values', () => {
    expect(extractExternalProductIdFromSheetId('apai-95225')).toBe('95225');
    expect(extractExternalProductIdFromSheetId('ethi- 17869')).toBe('17869');
    expect(extractExternalProductIdFromSheetId('flam-94288 ')).toBe('94288');
    expect(extractExternalProductIdFromSheetId('999.00 INR')).toBeNull();
  });

  it('builds 4-letter title prefix', () => {
    expect(buildTitlePrefix4('Apaisant Hair growth serum')).toBe('apai');
    expect(buildTitlePrefix4('Natural Vibes Rose')).toBe('natu');
  });

  it('extracts sku number part', () => {
    expect(extractSkuNumberPart('ABC-01208')).toBe('01208');
    expect(extractSkuNumberPart('SKU12-345')).toBe('345');
  });

  it('resolves sheet id when externalProductId hits lookup', () => {
    const result = resolveGoogleMerchantItemId({
      externalProductId: '95225',
      displayName: 'Apaisant Hair growth serum',
      productName: 'Apaisant Hair growth serum',
      sku: 'SKU-1',
      lookup: { '95225': 'apai-95225' },
    });
    expect(result).toEqual({ id: 'apai-95225', source: 'sheet' });
  });

  it('generates new id when no sheet hit', () => {
    expect(
      buildNewProductGoogleMerchantId({
        displayName: 'Abcd Something',
        productName: 'Fallback',
        sku: 'XX-01208',
      }),
    ).toBe('abcd-01208');

    const result = resolveGoogleMerchantItemId({
      externalProductId: '999999',
      displayName: 'Abcd Something',
      sku: 'XX-01208',
      lookup: {},
    });
    expect(result).toEqual({ id: 'abcd-01208', source: 'generated' });
  });
});
