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
  it('keeps a techbv promotional URL absolute, the same as production', () => {
    expect(
      rewriteLegacyStorefrontUrl('https://cureka.techbv.in/promotional/himalay-buy'),
    ).toBe('https://cureka.techbv.in/promotional/himalay-buy');
    expect(
      rewriteLegacyStorefrontUrl('https://www.cureka.techbv.com/shop/serum?sort=price#reviews'),
    ).toBe('https://www.cureka.techbv.com/shop/serum?sort=price#reviews');
    expect(rewriteLegacyStorefrontUrl('https://www.cureka.com/shop/serum')).toBe(
      'https://www.cureka.com/shop/serum',
    );
    expect(rewriteLegacyStorefrontUrl('/promotional/himalay-buy')).toBe(
      '/promotional/himalay-buy',
    );
  });
});
