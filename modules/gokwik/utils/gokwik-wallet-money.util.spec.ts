import { BadRequestException } from '@nestjs/common';
import {
  gokwikWalletRupeesToPaise,
  paiseToGokwikWalletRupees,
  remainingPayableRupeesForGokwik,
} from './gokwik-wallet-money.util';

describe('gokwik-wallet-money.util', () => {
  it('converts whole-rupee paise without float drift (₹0 / ₹100.00)', () => {
    expect(paiseToGokwikWalletRupees(0)).toBe(0);
    expect(paiseToGokwikWalletRupees(10000)).toBe(100);
    expect(paiseToGokwikWalletRupees(12500)).toBe(125);
  });

  it('rejects fractional rupee paise under the default whole-rupee policy (₹0.01 / ₹125.50)', () => {
    expect(() => paiseToGokwikWalletRupees(1)).toThrow(BadRequestException); // ₹0.01
    expect(() => paiseToGokwikWalletRupees(12550)).toThrow(BadRequestException); // ₹125.50
  });

  it('allows fractional wire amounts only when policy is relaxed', () => {
    expect(paiseToGokwikWalletRupees(1, { requireWholeRupees: false })).toBe(0.01);
    expect(paiseToGokwikWalletRupees(12550, { requireWholeRupees: false })).toBe(125.5);
  });

  it('parses GoKwik rupee wire values into paise (₹0.01 / ₹125.50 / ₹100.00)', () => {
    expect(gokwikWalletRupeesToPaise(0)).toBe(0);
    expect(gokwikWalletRupeesToPaise(0.01)).toBe(1);
    expect(gokwikWalletRupeesToPaise(100)).toBe(10000);
    expect(gokwikWalletRupeesToPaise(125.5)).toBe(12550);
  });

  it('computes remaining payable after wallet credit', () => {
    expect(
      remainingPayableRupeesForGokwik({
        eligibleTotalPaise: 10000,
        walletCreditPaise: 2500,
      }),
    ).toEqual({ walletCreditUsed: 25, total: 75 });
  });

  it('rejects wallet credit above eligible total', () => {
    expect(() =>
      remainingPayableRupeesForGokwik({
        eligibleTotalPaise: 1000,
        walletCreditPaise: 1001,
      }),
    ).toThrow(BadRequestException);
  });
});
