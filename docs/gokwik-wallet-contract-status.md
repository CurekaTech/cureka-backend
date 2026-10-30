# GoKwik Wallet — Contract Status Register (Phase 1)

`GOKWIK_WALLET_REDEMPTION_ENABLED` and live fund mutation must remain **`false` / blocked** until every critical blocker in `GOKWIK_WALLET_LIVE_BLOCKERS` is closed with written GoKwik confirmation (or equivalent official docs) and tests pass.

Code source of truth: `modules/gokwik/interfaces/gokwik-wallet-contract.interface.ts` (`GOKWIK_WALLET_CONTRACT_REGISTER`).

**Important:** Provisional assumptions below are **working hypotheses for implementation and tests**. They are **not** officially confirmed. Do not mark `CONFIRMED_BY_GOKWIK` or `CONFIRMED_BY_OFFICIAL_DOCS` from examples alone.

---

## Status legend

| Status | Meaning |
|--------|---------|
| `CONFIRMED_BY_OFFICIAL_DOCS` | Explicitly stated in GoKwik docs |
| `CONFIRMED_BY_GOKWIK` | Written confirmation from GoKwik |
| `CUREKA_POLICY_DECIDED` | Cureka accounting/product rule; may still need vendor alignment |
| `INFERRED_NOT_CONFIRMED` | Strong evidence from examples/code; not written confirmation |
| `BLOCKED` | Insufficient contract to implement live path safely |

For each question we record:

1. **Cureka policy decision**
2. **Verified documentation or code evidence**
3. **Provisional assumption** (working only — not confirmed)
4. **GoKwik confirmation still required**

---

## Question 1 — `AMOUNT_UNITS_RUPEES_OR_PAISE`

| Field | Doc type | Example | Inference |
|-------|----------|---------|-----------|
| `wallet_balance` | Integer | `500` | INR **rupees**, whole units |
| `usable_wallet_balance` | (example only) | `400` | Same as balance (rupees) |
| `wallet_credit_used` | Number | integer examples in cart flows | Rupees; integer preferred |
| `total` | Number | e.g. `1949` in Cureka MVP cart docs | Remaining payable after discounts/fees; after wallet apply, inferred remaining after credit |
| `subtotal` / `discount_total` / `shipping_total` | Number | integer examples | Rupees via existing `toGokwikAmount` (`Math.round`) |

| Dimension | Content |
|-----------|---------|
| **Cureka policy** | Internal wallet = integer **paise**. Adapter converts at boundary. Never silently round wallet credit up. |
| **Evidence** | Postman integer examples; cart mapper `toGokwikAmount` uses Math.round rupees. Subunit not stated in writing. |
| **Provisional assumption** | Wire amounts are INR rupees. Outbound wallet fields use **whole rupees**; floor eligible credit (never round up). |
| **GoKwik confirmation required** | Per-field rupees vs paise; whether `125.50` is valid on wallet fields; meaning of `total` after apply. |
| **Status** | `INFERRED_NOT_CONFIRMED` — **blocks live** |

Code: `gokwik-wallet-money.util.ts`, `floorWalletCreditToWholeRupeePaise`.

---

## Question 2 — `AUTH_HEADER_EXACT_SCHEME`

| Dimension | Content |
|-----------|---------|
| **Cureka policy** | Keep wallet endpoints behind `GokwikCheckoutAuthGuard` + `VerifiedUserGuard` + `GokwikCartOwnerGuard`. Do not weaken auth. Do not log tokens. |
| **Evidence** | Postman mentions 401 for invalid/expired `access_token` but **no header name**. Existing merchant cart/order callbacks use `Authorization: Bearer <gokwik_checkout>`. Webhooks use secret headers (different path). |
| **Provisional assumption** | Same Bearer checkout token + cart ownership as other merchant cart callbacks. No invented wallet-only credential. |
| **GoKwik confirmation required** | Exact header name/scheme for get-user / apply / remove. |
| **Status** | `INFERRED_NOT_CONFIRMED` — **blocks live** |

Code: `gokwik-wallet.controller.ts`.

---

## Question 3 — `FINAL_DEBIT_TRIGGER_EVENT`

| Dimension | Content |
|-----------|---------|
| **Cureka policy** | Apply = **reserve only**. Final `CHECKOUT_DEBIT` only after verified server-side settlement. Never trust browser thank-you / redirect. |
| **Evidence** | Trusted prepaid path today: `GokwikWebhookService.processTransaction` on success/paid. Docs do not state when wallet credit becomes a final debit. |
| **Provisional assumption** | Transaction webhook success/paid is the intended consume trigger. Live consume stays disabled until confirmed. |
| **GoKwik confirmation required** | Confirm apply is hold/display only; name the sole final-debit event. |
| **Status** | `CUREKA_POLICY_DECIDED` + vendor confirm — **blocks live** |

Also listed in `GOKWIK_WALLET_SETTLEMENT_BLOCKERS`.

---

## Question 4 — `COD_AND_PARTIAL_COD_EXCLUSION`

| Dimension | Content |
|-----------|---------|
| **Cureka policy** | Server-side reject wallet with `cod` / `pp-cod`. Prefer omitting those from `available_payment_methods` when wallet applied. Switch to COD → release reservation. |
| **Evidence** | GoKwik create-order accepts `cod\|prepaid\|pp-cod`. Cart mapper can override `available_payment_methods`. UI enforcement when wallet applied is undocumented. |
| **Provisional assumption** | `cod` and `pp-cod` are always rejected for wallet redemption regardless of GoKwik UI. |
| **GoKwik confirmation required** | Does Checkout honor `available_payment_methods` after apply? Expected merchant response if customer selects COD after credit? |
| **Status** | `CUREKA_POLICY_DECIDED` — **blocks live** until UI/override behavior confirmed |

Code: `assertPaymentMethodAllowsWallet`, `isGokwikWalletUnsupportedPaymentMethod`.

---

## Question 5 — `CART_EDIT_AFTER_APPLY`

| Dimension | Content |
|-----------|---------|
| **Cureka policy** | Recalculate on each apply; one active reservation per cart; release/replace on material change. Do not invent outbound GoKwik calls. |
| **Evidence** | Apply/remove docs are independent; no cart-edit sequence documented. |
| **Provisional assumption** | Material eligible-total or credit change → plan release then replace. GoKwik call order unknown. |
| **GoKwik confirmation required** | After cart/discount/shipping change: remove+apply, re-apply only, or error forcing refresh? |
| **Status** | `BLOCKED` — **blocks live** |

Code: `isMaterialGokwikWalletCartChange`, `planApply.requiresReleaseReplace`.

---

## Question 6 — `IDEMPOTENCY_KEYS_AND_RETRIES`

| Dimension | Content |
|-----------|---------|
| **Cureka policy** | Internal keys `wallet-gokwik-apply:{cartId}:{fingerprint}` / `wallet-gokwik-remove:{cartId}`. Unique constraints + account locks. Do **not** invent a GoKwik request field. |
| **Evidence** | Official apply/remove schemas have no idempotency key. |
| **Provisional assumption** | Duplicate applies with same cart + fingerprint are no-ops via internal keys only. |
| **GoKwik confirmation required** | Retry/timeout semantics; are duplicate applies expected to be no-ops? |
| **Status** | `BLOCKED` — **blocks live** |

---

## Question 7 — `SETTLEMENT_WEBHOOK_CORRELATION`

| Identifier | Existing Cureka mapping |
|------------|-------------------------|
| Customer | Cart `userId` / session |
| `cart_id` | `carts.id` |
| Cureka order | `orders.id` / `order_number` |
| GoKwik payment | `gokwik_orders.payment_id` ← webhook `paymentId` |
| Wallet reservation | **not yet persisted for GoKwik wallet path** |

| Dimension | Content |
|-----------|---------|
| **Cureka policy** | Persist cart_id, customerId, reservationId, wallet/gateway paise, GoKwik payment/order ids before settle; amount checks; idempotent consume. |
| **Evidence** | Existing webhook correlates paymentId → gokwik_orders → order. Wallet reservation↔cart mapping for this path is not implemented. |
| **Provisional assumption** | Reuse paymentId → gokwik_orders once reservation↔cart_id persistence exists. |
| **GoKwik confirmation required** | IDs present at apply and on paid transaction for wallet-funded checkouts. |
| **Status** | `INFERRED_NOT_CONFIRMED` — **blocks live** |

Also in `GOKWIK_WALLET_SETTLEMENT_BLOCKERS`.

---

## Question 8 — `APPLY_FAILURE_AFTER_SUCCESSFUL_RESERVE`

| Dimension | Content |
|-----------|---------|
| **Cureka policy** | Release only on definitive unsuccessful outcomes / explicit remove / ops reconcile. No TTL-only release. Late success must not race release. Uncertain states stay pending. |
| **Evidence** | Native wallet release policy. GoKwik docs do not guarantee abandon/cancel callback after apply. |
| **Provisional assumption** | Without a guaranteed abandon signal, live reserve cannot be enabled safely. |
| **GoKwik confirmation required** | Guaranteed merchant signal (and timing) when checkout is abandoned after apply without paid transaction. |
| **Status** | `CUREKA_POLICY_DECIDED` + missing signal — **blocks live** |

Also in `GOKWIK_WALLET_SETTLEMENT_BLOCKERS`.

---

## Compatibility

- Ordinary GoKwik checkout (flag off): unchanged; `wallet_credit_used: 0`.
- Native Razorpay/Cashfree wallet: separate flag `WALLET_CHECKOUT_ENABLED`.
- Apply/remove under flag-off → `GOKWIK_WALLET_DISABLED` (no balance mutation).
- Flag on + blockers → `GOKWIK_WALLET_CONTRACT_INCOMPLETE` (no balance mutation).
- Speculative consume → `GOKWIK_WALLET_SETTLEMENT_BLOCKED`.

## Safe rollout (when unblocked)

1. Keep `GOKWIK_WALLET_REDEMPTION_ENABLED=false` in production.
2. Obtain written answers to all Ask-GoKwik items above.
3. Clear `blocksLiveRedemption` only after confirmation + tests.
4. Implement live reserve/remove/consume against verified contract.
5. Staging enable only; production only after soak.

See also: `docs/gokwik-wallet-staging-checklist.md`.
