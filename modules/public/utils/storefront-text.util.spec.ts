import { repairUtf8Mojibake } from './repair-utf8-mojibake';
import { rewriteLegacyStorefrontUrl } from './rewrite-legacy-storefront-url';

describe('repairUtf8Mojibake', () => {
  it('repairs an en dash that was decoded as Windows-1252', () => {
    const stored = 'CeraVe \u00e2\u20ac\u201c Cream';
    expect(repairUtf8Mojibake(stored)).toBe('CeraVe \u2013 Cream');
  });

  it('repairs a right single quote that was decoded as Windows-1252', () => {
    const stored = `Women\u00e2\u20ac\u2122s`;
    expect(repairUtf8Mojibake(stored)).toBe('Women\u2019s');
  });

  it('leaves plain Unicode unchanged', () => {
    expect(repairUtf8Mojibake('Omega-3')).toBe('Omega-3');
  });
});

describe('rewriteLegacyStorefrontUrl', () => {
  it('keeps path, search, and hash from the old hosts', () => {
    expect(
      rewriteLegacyStorefrontUrl('https://cureka.techbv.in/shop/serum?sort=price#reviews'),
    ).toBe('/shop/serum?sort=price#reviews');
    expect(rewriteLegacyStorefrontUrl('https://www.cureka.techbv.com/')).toBe('/');
    expect(rewriteLegacyStorefrontUrl('https://www.cureka.com/shop/serum')).toBe(
      'https://www.cureka.com/shop/serum',
    );
  });
});
