import {
  gokwikWalletApplyIdempotencyKey,
  isGokwikWalletUnsupportedPaymentMethod,
} from './gokwik-wallet.constants';

describe('gokwik-wallet.constants', () => {
  it('excludes COD and partial COD', () => {
    expect(isGokwikWalletUnsupportedPaymentMethod('cod')).toBe(true);
    expect(isGokwikWalletUnsupportedPaymentMethod('pp-cod')).toBe(true);
    expect(isGokwikWalletUnsupportedPaymentMethod('COD')).toBe(true);
    expect(isGokwikWalletUnsupportedPaymentMethod('prepaid')).toBe(false);
    expect(isGokwikWalletUnsupportedPaymentMethod(null)).toBe(false);
  });

  it('builds a stable internal apply idempotency key from cart_id', () => {
    expect(gokwikWalletApplyIdempotencyKey('cart-abc')).toBe('wallet-gokwik-apply:cart-abc');
  });
});
