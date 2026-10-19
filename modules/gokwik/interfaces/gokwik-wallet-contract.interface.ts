/**
 * GoKwik Custom Wallet & Membership contract types + status register.
 *
 * Call direction (verified from GoKwik Postman docs + Cureka merchant-callback docs):
 * GoKwik Checkout calls merchant-hosted endpoints
 * (`<<merchant_url>>/get-user`, `/apply-wallet-credit`, `/remove-wallet-credit`).
 * Cureka owns wallet balance and application rules.
 *
 * @see https://documenter.getpostman.com/view/53067515/2sBXqQFxdo#233feb8f-5773-46f1-a051-498f623bc95a
 * @see https://documenter.getpostman.com/view/53067515/2sBXqQFxdo#0cd9a204-61d0-4027-8c59-6f4ad6de6e32
 * @see docs/gokwik-wallet-contract-status.md
 */

export type GokwikWalletApplyRequest = {
  /** Merchant cart ID passed into GoKwik Checkout UI SDK. Mandatory. */
  cart_id: string;
  /**
   * Optional user identification (userId / customer_token / phone).
   * Docs: omit when the user is already attached to the cart.
   */
  user_id?: string;
};

export type GokwikWalletRemoveRequest = {
  cart_id: string;
  /** Present in the remove-wallet-credit curl sample; not listed as mandatory in the field table. */
  user_id?: string;
};

/**
 * Cart fields required when returning apply/remove wallet credit responses.
 * Other cart fields (items, shipping methods, etc.) are supplied by the
 * existing GoKwik cart mapper and are not duplicated here.
 */
export type GokwikWalletCartTotals = {
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  /** Remaining payable after wallet credit (inferred from apply docs; confirm with GoKwik). */
  total: number;
  currency: string;
  /** Amount applied from the merchant wallet for this cart. */
  wallet_credit_used: number;
};

export type GokwikWalletCartResponse = {
  data: {
    cart: GokwikWalletCartTotals & Record<string, unknown>;
  };
};

export type GokwikWalletContractQuestionId =
  | 'AMOUNT_UNITS_RUPEES_OR_PAISE'
  | 'AUTH_HEADER_EXACT_SCHEME'
  | 'FINAL_DEBIT_TRIGGER_EVENT'
  | 'COD_AND_PARTIAL_COD_EXCLUSION'
  | 'CART_EDIT_AFTER_APPLY'
  | 'IDEMPOTENCY_KEYS_AND_RETRIES'
  | 'SETTLEMENT_WEBHOOK_CORRELATION'
  | 'APPLY_FAILURE_AFTER_SUCCESSFUL_RESERVE';

export type GokwikWalletContractQuestionStatus =
  | 'CONFIRMED_BY_OFFICIAL_DOCS'
  | 'CONFIRMED_BY_GOKWIK'
  | 'CUREKA_POLICY_DECIDED'
  | 'INFERRED_NOT_CONFIRMED'
  | 'BLOCKED';

export type GokwikWalletContractQuestionRecord = {
  id: GokwikWalletContractQuestionId;
  status: GokwikWalletContractQuestionStatus;
  /** Short evidence summary; full detail in docs/gokwik-wallet-contract-status.md */
  evidence: string;
  /** Cureka product/accounting rule (may still need vendor alignment). */
  curekaDecision: string;
  /**
   * Working assumption used in code/tests. Never treat as vendor-confirmed.
   * Empty string when no provisional assumption is in force.
   */
  provisionalAssumption: string;
  externalConfirmationRequired: string | null;
  testsRequired: string[];
  /** When true, live fund mutation / settlement must stay disabled. */
  blocksLiveRedemption: boolean;
};

/**
 * Living register for the eight Phase-1 GoKwik wallet contract questions.
 * Do not mark vendor-confirmed from examples alone.
 */
export const GOKWIK_WALLET_CONTRACT_REGISTER: GokwikWalletContractQuestionRecord[] = [
  {
    id: 'AMOUNT_UNITS_RUPEES_OR_PAISE',
    status: 'INFERRED_NOT_CONFIRMED',
    evidence:
      'Postman: wallet_balance typed Integer (example 500); cart money fields typed Number with integer examples; Cureka toGokwikAmount() Math.round rupees. Subunit not stated in writing.',
    curekaDecision:
      'Treat GoKwik wire amounts as INR rupees at the adapter boundary; keep ledger/reservations in integer paise. Do not send paise. Do not silently Math.round wallet allocations — refuse fractional wire amounts until GoKwik confirms integer-only or decimal support.',
    provisionalAssumption:
      'Wire amounts are INR rupees. Outbound wallet_credit_used / wallet_balance / remaining total must be whole rupees; floor eligible credit to whole-rupee paise rather than round up.',
    externalConfirmationRequired:
      'Confirm independently for wallet_balance, usable_wallet_balance, wallet_credit_used, total, subtotal, discount_total, shipping_total: rupees vs paise, and whether fractional rupees (e.g. 125.50) are allowed.',
    testsRequired: [
      'paise↔rupee conversion at adapter boundary',
      'reject fractional rupee when integer-only policy enforced',
      '₹0.01 / ₹125.50 / ₹100.00 / zero / large balance fixtures',
    ],
    blocksLiveRedemption: true,
  },
  {
    id: 'AUTH_HEADER_EXACT_SCHEME',
    status: 'INFERRED_NOT_CONFIRMED',
    evidence:
      'Postman wallet/get-user docs only mention 401 for invalid/expired access_token (no header name). Cureka merchant cart/order callbacks use Authorization: Bearer <gokwik_checkout> via GokwikCheckoutAuthGuard; webhooks use x-gokwik-*-secret.',
    curekaDecision:
      'Keep wallet endpoints behind the same GokwikCheckoutAuthGuard + cart-owner checks as get-cart until GoKwik confirms a different scheme. Do not weaken auth. Do not log tokens.',
    provisionalAssumption:
      'Same Authorization: Bearer <gokwik_checkout> + VerifiedUser + cart-owner guards as other merchant cart callbacks. No invented wallet-only credential.',
    externalConfirmationRequired:
      'Exact header name/scheme for apply/remove/get-user (Bearer gokwik_checkout vs separate access_token credential). Confirm same credentials as other merchant callbacks.',
    testsRequired: [
      'missing Authorization → 401',
      'invalid Bearer → 401',
      'valid gokwik_checkout Bearer + cart ownership (when live path exists)',
    ],
    blocksLiveRedemption: true,
  },
  {
    id: 'FINAL_DEBIT_TRIGGER_EVENT',
    status: 'CUREKA_POLICY_DECIDED',
    evidence:
      'Cureka policy: apply = reserve only. Existing trusted prepaid settlement path is GoKwik transaction webhook success/paid (gokwik-webhook.service processTransaction). Browser thank-you is not settlement proof. Docs do not state when wallet credit becomes a final debit.',
    curekaDecision:
      'Reserve on verified apply; final CHECKOUT_DEBIT only after authentic transaction webhook success/paid with amount checks and idempotent consume. Never debit on apply alone or on browser redirect.',
    provisionalAssumption:
      'Transaction webhook success/paid is the intended consume trigger; apply never debits. Live consume stays disabled until GoKwik confirms this event.',
    externalConfirmationRequired:
      'Confirm that apply-wallet-credit is display/hold only at merchant, and that transaction webhook success (or named alternative) is the sole final-debit trigger for wallet-funded checkouts.',
    testsRequired: [
      'apply does not create CHECKOUT_DEBIT',
      'duplicate transaction webhook does not double-debit',
      'browser success alone does not debit',
    ],
    blocksLiveRedemption: true,
  },
  {
    id: 'COD_AND_PARTIAL_COD_EXCLUSION',
    status: 'CUREKA_POLICY_DECIDED',
    evidence:
      'Phase-1 product rule: no wallet with COD or pp-cod. GoKwik create-order accepts payment_method cod|prepaid|pp-cod. Cart mapper can send available_payment_methods override. Docs do not state UI enforcement when wallet is applied.',
    curekaDecision:
      'Server-side reject wallet apply/settle when payment method is cod or pp-cod; when wallet is applied, omit COD/pp-cod from available_payment_methods if returning cart overrides. Switching to COD must release the reservation. Existing COD checkout without wallet unchanged.',
    provisionalAssumption:
      'cod and pp-cod are always rejected for wallet redemption regardless of GoKwik UI behavior.',
    externalConfirmationRequired:
      'Confirm GoKwik honors available_payment_methods overrides after wallet apply, and the expected merchant response when customer selects COD after wallet credit.',
    testsRequired: [
      'COD + wallet rejected',
      'pp-cod + wallet rejected',
      'prepaid + wallet allowed (when live)',
      'payment-method switch to COD releases reservation',
    ],
    blocksLiveRedemption: true,
  },
  {
    id: 'CART_EDIT_AFTER_APPLY',
    status: 'BLOCKED',
    evidence:
      'Apply/remove docs describe apply and remove independently; no documented cart-edit sequence, auto-adjust, or forced refresh.',
    curekaDecision:
      'Intended Cureka policy: recalculate on each apply; single active reservation per cart; release/replace on material cart change. Do not implement a guessed GoKwik sequence until confirmed.',
    provisionalAssumption:
      'Material eligible-total or credit change → plan release then replace. GoKwik call order is unknown; Cureka will not invent outbound remove/apply calls.',
    externalConfirmationRequired:
      'After cart/discount/shipping changes, does GoKwik call remove then apply, re-apply only, or expect an error forcing refresh?',
    testsRequired: [
      'repeated apply same cart',
      'cart total increase/decrease',
      'item removal / discount / shipping change',
      'abandonment',
    ],
    blocksLiveRedemption: true,
  },
  {
    id: 'IDEMPOTENCY_KEYS_AND_RETRIES',
    status: 'BLOCKED',
    evidence:
      'Official apply/remove request schemas have no idempotency key. Cureka native wallet uses keys like wallet-checkout:{paymentRequestId}.',
    curekaDecision:
      'When implementing live apply: internal idempotency key wallet-gokwik-apply:{cartId} (+ allocation fingerprint). Unique reservation constraints + account row locks. Do not invent a GoKwik request field.',
    provisionalAssumption:
      'Duplicate applies with the same cart + fingerprint are no-ops via internal keys only. No GoKwik request idempotency field is invented.',
    externalConfirmationRequired:
      'Documented retry/timeout behavior for apply/remove/get-user and whether duplicate applies are expected to be no-ops.',
    testsRequired: [
      'duplicate apply/remove',
      'concurrent apply same cart',
      'timeout-and-retry',
      'DB rollback',
    ],
    blocksLiveRedemption: true,
  },
  {
    id: 'SETTLEMENT_WEBHOOK_CORRELATION',
    status: 'INFERRED_NOT_CONFIRMED',
    evidence:
      'Existing transaction webhook correlates paymentId → gokwik_orders → Cureka order; amount checked vs linked paymentAmount. Cart_id is merchant cart UUID. Wallet reservation↔order mapping for GoKwik wallet checkouts is not implemented.',
    curekaDecision:
      'Before live redemption: persist cart_id, customerId, reservationId, wallet/gateway paise, and GoKwik payment/order ids before settle; settle only on verified transaction success with amount checks; duplicate/out-of-order handled by existing status transition helpers.',
    provisionalAssumption:
      'Reuse existing paymentId → gokwik_orders correlation once wallet reservation↔cart_id persistence exists. Live consume stays off until IDs are confirmed.',
    externalConfirmationRequired:
      'Confirm identifier set available at apply time and on transaction webhook for wallet-funded checkouts (cart_id, gokwik order/payment ids, merchant order number).',
    testsRequired: [
      'amount mismatch quarantine',
      'duplicate webhook',
      'out-of-order status ignored',
      'late success after abandon',
    ],
    blocksLiveRedemption: true,
  },
  {
    id: 'APPLY_FAILURE_AFTER_SUCCESSFUL_RESERVE',
    status: 'CUREKA_POLICY_DECIDED',
    evidence:
      'Native wallet release policy: release on definitive unsuccessful terminal outcomes only; no TTL-only release; late success must not race release. GoKwik docs do not guarantee cancel/expiry callback for abandoned wallet apply.',
    curekaDecision:
      'Reserve ≠ debit. Release on definitive cancel/fail/remove-wallet-credit/ops reconcile. Uncertain outcomes stay pending until provider truth. Operational stale-reservation reconcile required if GoKwik cannot guarantee signals.',
    provisionalAssumption:
      'No TTL-only auto-release of reserved funds. Without a guaranteed abandon signal, live reserve cannot be enabled safely.',
    externalConfirmationRequired:
      'Guaranteed merchant signals (and timing) when checkout is abandoned after apply-wallet-credit without paid transaction.',
    testsRequired: [
      'apply failure after reserve',
      'order/payment initiation failure',
      'definitive cancel/expiry',
      'ambiguous timeout',
      'late success vs release race',
      'duplicate release',
    ],
    blocksLiveRedemption: true,
  },
];

/** Settlement-critical blockers: consume/debit must stay off while any of these remain. */
export const GOKWIK_WALLET_SETTLEMENT_BLOCKERS: GokwikWalletContractQuestionId[] = [
  'FINAL_DEBIT_TRIGGER_EVENT',
  'SETTLEMENT_WEBHOOK_CORRELATION',
  'APPLY_FAILURE_AFTER_SUCCESSFUL_RESERVE',
];

/** Question IDs that still block enabling `GOKWIK_WALLET_REDEMPTION_ENABLED`. */
export const GOKWIK_WALLET_LIVE_BLOCKERS: GokwikWalletContractQuestionId[] =
  GOKWIK_WALLET_CONTRACT_REGISTER.filter((q) => q.blocksLiveRedemption).map((q) => q.id);

/** @deprecated Prefer GOKWIK_WALLET_LIVE_BLOCKERS / register; kept for OPEN_QUESTIONS compatibility. */
export type GokwikWalletContractOpenQuestion = GokwikWalletContractQuestionId;
