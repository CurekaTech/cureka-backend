import {
  computeEligibleWalletCreditPaise,
  floorWalletCreditToWholeRupeePaise,
  gokwikWalletAllocationFingerprint,
  gokwikWalletApplyIdempotencyKeyWithFingerprint,
  gokwikWalletRemoveIdempotencyKey,
  isMaterialGokwikWalletCartChange,
} from './gokwik-wallet-allocation.util';

describe('gokwik-wallet-allocation.util', () => {
  it('computes max eligible credit as min(usable, cart total)', () => {
    expect(
      computeEligibleWalletCreditPaise({
        availableBalancePaise: 10000,
        reservedBalancePaise: 2000,
        eligibleCartTotalPaise: 5000,
      }),
    ).toEqual({
      usableBalancePaise: 8000,
      walletCreditPaise: 5000,
      remainingPayablePaise: 0,
    });
  });

  it('caps credit at usable balance when cart is larger', () => {
    expect(
      computeEligibleWalletCreditPaise({
        availableBalancePaise: 3000,
        reservedBalancePaise: 1000,
        eligibleCartTotalPaise: 10000,
      }),
    ).toEqual({
      usableBalancePaise: 2000,
      walletCreditPaise: 2000,
      remainingPayablePaise: 8000,
    });
  });

  it('floors credit to whole rupees without rounding up (₹0.01 / ₹125.50)', () => {
    expect(floorWalletCreditToWholeRupeePaise(1)).toBe(0); // ₹0.01
    expect(floorWalletCreditToWholeRupeePaise(12550)).toBe(12500); // ₹125.50 → ₹125
    expect(floorWalletCreditToWholeRupeePaise(10000)).toBe(10000); // ₹100.00
  });

  it('builds stable fingerprints and idempotency keys', () => {
    const fingerprint = gokwikWalletAllocationFingerprint({
      cartId: 'cart-1',
      eligibleCartTotalPaise: 10000,
      walletCreditPaise: 2500,
    });
    expect(fingerprint).toBe('cart-1:10000:2500');
    expect(gokwikWalletApplyIdempotencyKeyWithFingerprint('cart-1', fingerprint)).toBe(
      'wallet-gokwik-apply:cart-1:cart-1:10000:2500',
    );
    expect(gokwikWalletRemoveIdempotencyKey('cart-1')).toBe('wallet-gokwik-remove:cart-1');
  });

  it('detects material cart changes for release/replace', () => {
    expect(
      isMaterialGokwikWalletCartChange({
        previousEligibleCartTotalPaise: 10000,
        nextEligibleCartTotalPaise: 10000,
        previousWalletCreditPaise: 2000,
        nextWalletCreditPaise: 2000,
      }),
    ).toBe(false);
    expect(
      isMaterialGokwikWalletCartChange({
        previousEligibleCartTotalPaise: 10000,
        nextEligibleCartTotalPaise: 9000,
        previousWalletCreditPaise: 2000,
        nextWalletCreditPaise: 2000,
      }),
    ).toBe(true);
  });
});
