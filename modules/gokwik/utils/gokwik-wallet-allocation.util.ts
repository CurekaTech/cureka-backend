import { BadRequestException } from '@nestjs/common';
import { gokwikWalletApplyIdempotencyKey } from '../constants/gokwik-wallet.constants';

/**
 * Cureka-authoritative GoKwik wallet allocation helpers.
 * Pure functions — no ledger mutation. Used by the provisional adapter and tests.
 *
 * Units: internal = integer paise. GoKwik wire = provisional INR rupees (inferred).
 */

export type GokwikWalletEligibilityInput = {
  /** Posted wallet balance in paise (Cureka ledger). */
  availableBalancePaise: number;
  /** Already reserved (other holds) in paise. */
  reservedBalancePaise: number;
  /** Cart payable eligible for wallet (after discounts/fees) in paise. */
  eligibleCartTotalPaise: number;
};

export type GokwikWalletEligibilityResult = {
  usableBalancePaise: number;
  walletCreditPaise: number;
  remainingPayablePaise: number;
};

/**
 * Cureka owns max eligible contribution: min(usable balance, eligible cart total).
 * Never trusts a client- or GoKwik-supplied credit amount as authoritative.
 */
export function computeEligibleWalletCreditPaise(
  input: GokwikWalletEligibilityInput,
): GokwikWalletEligibilityResult {
  assertNonNegativePaise(input.availableBalancePaise, 'availableBalancePaise');
  assertNonNegativePaise(input.reservedBalancePaise, 'reservedBalancePaise');
  assertNonNegativePaise(input.eligibleCartTotalPaise, 'eligibleCartTotalPaise');

  const usableBalancePaise = Math.max(
    0,
    input.availableBalancePaise - input.reservedBalancePaise,
  );
  const walletCreditPaise = Math.min(usableBalancePaise, input.eligibleCartTotalPaise);
  return {
    usableBalancePaise,
    walletCreditPaise,
    remainingPayablePaise: input.eligibleCartTotalPaise - walletCreditPaise,
  };
}

/**
 * Fingerprint of the cart economics that the reservation covers.
 * Material cart changes require release + replace (provisional Cureka policy).
 */
export function gokwikWalletAllocationFingerprint(params: {
  cartId: string;
  eligibleCartTotalPaise: number;
  walletCreditPaise: number;
}): string {
  return [
    params.cartId.trim(),
    String(params.eligibleCartTotalPaise),
    String(params.walletCreditPaise),
  ].join(':');
}

/** Internal idempotency key including allocation fingerprint (not a GoKwik wire field). */
export function gokwikWalletApplyIdempotencyKeyWithFingerprint(
  cartId: string,
  fingerprint: string,
): string {
  return `${gokwikWalletApplyIdempotencyKey(cartId)}:${fingerprint}`;
}

export function gokwikWalletRemoveIdempotencyKey(cartId: string): string {
  return `wallet-gokwik-remove:${cartId.trim()}`;
}

/** Reads eligible total + credit from `wallet-gokwik-apply:{cart}:{cart}:{eligible}:{credit}`. */
export function parseGokwikWalletApplyAllocation(
  idempotencyKey: string,
): { eligibleCartTotalPaise: number; walletCreditPaise: number } | null {
  const parts = idempotencyKey.split(':');
  if (parts.length < 2) return null;
  const walletCreditPaise = Number(parts[parts.length - 1]);
  const eligibleCartTotalPaise = Number(parts[parts.length - 2]);
  if (
    !Number.isSafeInteger(walletCreditPaise) ||
    !Number.isSafeInteger(eligibleCartTotalPaise) ||
    walletCreditPaise < 0 ||
    eligibleCartTotalPaise < 0
  ) {
    return null;
  }
  return { eligibleCartTotalPaise, walletCreditPaise };
}

/**
 * Provisional cart-edit policy: any change to eligible total or credit is material.
 * GoKwik sequence (remove+apply vs re-apply) is still vendor-unconfirmed;
 * Cureka always plans release-then-replace for material changes.
 */
export function isMaterialGokwikWalletCartChange(params: {
  previousEligibleCartTotalPaise: number;
  nextEligibleCartTotalPaise: number;
  previousWalletCreditPaise: number;
  nextWalletCreditPaise: number;
}): boolean {
  return (
    params.previousEligibleCartTotalPaise !== params.nextEligibleCartTotalPaise ||
    params.previousWalletCreditPaise !== params.nextWalletCreditPaise
  );
}

/**
 * Floors usable credit to whole rupees for provisional GoKwik wire (no silent round-up).
 * Returns paise divisible by 100, never exceeding the exact eligible credit.
 */
export function floorWalletCreditToWholeRupeePaise(walletCreditPaise: number): number {
  assertNonNegativePaise(walletCreditPaise, 'walletCreditPaise');
  return Math.floor(walletCreditPaise / 100) * 100;
}

function assertNonNegativePaise(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer paise value`);
  }
}
