import { lineMatchesOfferScope, readOfferScope } from './offer-scope.util';

const brand = '11111111-1111-4111-8111-111111111111';
const otherBrand = '22222222-2222-4222-8222-222222222222';
const root = '33333333-3333-4333-8333-333333333333';
const child = '44444444-4444-4444-8444-444444444444';

describe('offer scope', () => {
  it('treats a missing scope as no extra audience', () => {
    expect(readOfferScope({})).toEqual({ brandIds: [], categoryIds: [] });
    expect(lineMatchesOfferScope({ brandId: brand, categoryId: root }, readOfferScope({}))).toBe(false);
  });

  it('matches any selected brand and ignores invalid ids', () => {
    const scope = readOfferScope({ brandIds: [brand, 'not-a-uuid', brand] });
    expect(scope.brandIds).toEqual([brand]);
    expect(lineMatchesOfferScope({ brandId: brand }, scope)).toBe(true);
    expect(lineMatchesOfferScope({ brandId: otherBrand }, scope)).toBe(false);
  });

  it('matches a parent or child id stored on the product path once', () => {
    const product = { categoryId: root, subCategoryId: child };
    expect(lineMatchesOfferScope(product, { brandIds: [], categoryIds: [root] })).toBe(true);
    expect(lineMatchesOfferScope(product, { brandIds: [], categoryIds: [child] })).toBe(true);
    expect(lineMatchesOfferScope(product, { brandIds: [brand], categoryIds: [root, child] })).toBe(true);
    expect(lineMatchesOfferScope({ categoryId: otherBrand }, { brandIds: [], categoryIds: [root] })).toBe(false);
  });
});
