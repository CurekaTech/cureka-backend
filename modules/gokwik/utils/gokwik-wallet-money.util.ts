import { BadRequestException } from '@nestjs/common';
import { paiseToRupees, rupeesToPaise } from '@modules/refund-requests/utils/wallet-money.util';

/**
 * GoKwik wallet money conversion at the adapter boundary only.
 *
 * Inference (not vendor-confirmed): GoKwik wire fields use INR rupees.
 * Cureka wallet accounting stays in integer paise.
 *
 * Until GoKwik confirms fractional rupees are allowed on wallet fields,
 * outbound wallet_credit_used / wallet_balance must be whole rupees.
 * Callers must not silently round a paise allocation that is not divisible by 100.
 */

export type GokwikWalletWireAmountPolicy = {
  /** When true, reject paise that are not whole rupees instead of rounding. */
  requireWholeRupees: boolean;
};

const DEFAULT_POLICY: GokwikWalletWireAmountPolicy = {
  requireWholeRupees: true,
};

/** Convert authoritative Cureka paise → GoKwik wire rupees. */
export function paiseToGokwikWalletRupees(
  amountPaise: number,
  policy: GokwikWalletWireAmountPolicy = DEFAULT_POLICY,
): number {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new BadRequestException('Wallet amount must be a non-negative integer paise value');
  }
  if (policy.requireWholeRupees && amountPaise % 100 !== 0) {
    throw new BadRequestException({
      code: 'GOKWIK_WALLET_FRACTIONAL_RUPEE',
      error:
        'GoKwik wallet wire amounts require whole INR rupees until fractional support is confirmed',
      amountPaise,
    });
  }
  // Whole-rupee path avoids float; fractional path only if policy relaxes later.
  if (amountPaise % 100 === 0) {
    return amountPaise / 100;
  }
  return Number(paiseToRupees(amountPaise));
}

/** Parse a GoKwik wire rupee amount into Cureka paise (rejects non-finite / negative). */
export function gokwikWalletRupeesToPaise(wireRupees: number): number {
  if (!Number.isFinite(wireRupees) || wireRupees < 0) {
    throw new BadRequestException('GoKwik wallet rupee amount must be a non-negative finite number');
  }
  return rupeesToPaise(wireRupees.toFixed(2));
}

/**
 * Remaining payable after wallet credit, in rupees, for GoKwik `total`.
 * `eligibleTotalPaise` and `walletCreditPaise` are Cureka-authoritative.
 */
export function remainingPayableRupeesForGokwik(params: {
  eligibleTotalPaise: number;
  walletCreditPaise: number;
  policy?: GokwikWalletWireAmountPolicy;
}): { walletCreditUsed: number; total: number } {
  const wallet = Math.max(0, params.walletCreditPaise);
  const eligible = Math.max(0, params.eligibleTotalPaise);
  if (wallet > eligible) {
    throw new BadRequestException('Wallet credit cannot exceed eligible cart total');
  }
  return {
    walletCreditUsed: paiseToGokwikWalletRupees(wallet, params.policy),
    total: paiseToGokwikWalletRupees(eligible - wallet, params.policy),
  };
}
