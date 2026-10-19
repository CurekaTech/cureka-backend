/**
 * Cureka Wallet Phase 1 policy for GoKwik payment methods.
 * Wallet redemption is not supported with COD or partial COD unless product
 * explicitly approves a different policy later.
 */
export const GOKWIK_WALLET_UNSUPPORTED_PAYMENT_METHODS = ['cod', 'pp-cod'] as const;

export type GokwikWalletUnsupportedPaymentMethod =
  (typeof GOKWIK_WALLET_UNSUPPORTED_PAYMENT_METHODS)[number];

export function isGokwikWalletUnsupportedPaymentMethod(
  paymentMethod: string | null | undefined,
): paymentMethod is GokwikWalletUnsupportedPaymentMethod {
  const normalized = String(paymentMethod ?? '').trim().toLowerCase();
  return (GOKWIK_WALLET_UNSUPPORTED_PAYMENT_METHODS as readonly string[]).includes(normalized);
}

/**
 * Idempotency key prefix for GoKwik cart wallet reservations.
 * Internal Cureka key only — not a GoKwik request field (none is documented).
 */
export function gokwikWalletApplyIdempotencyKey(cartId: string): string {
  return `wallet-gokwik-apply:${cartId.trim()}`;
}
