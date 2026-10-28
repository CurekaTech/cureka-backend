import { BOB_DEFAULT_STOREFRONT_URL, toBobCartRecoveryUrl } from './bob.util';

describe('toBobCartRecoveryUrl', () => {
  it('uses the storefront cart page BOB confirmed', () => {
    expect(toBobCartRecoveryUrl('https://www.cureka.com')).toBe('https://www.cureka.com/cart');
  });

  it('strips trailing slashes and falls back to the live storefront', () => {
    expect(toBobCartRecoveryUrl('https://www.cureka.com/')).toBe('https://www.cureka.com/cart');
    expect(toBobCartRecoveryUrl('')).toBe(`${BOB_DEFAULT_STOREFRONT_URL}/cart`);
    expect(toBobCartRecoveryUrl(undefined)).toBe(`${BOB_DEFAULT_STOREFRONT_URL}/cart`);
  });
});
