# GoKwik Wallet — Staging Test Checklist

**Do not enable** `GOKWIK_WALLET_REDEMPTION_ENABLED` or `WALLET_CHECKOUT_ENABLED` against production customers while `GOKWIK_WALLET_LIVE_BLOCKERS` is non-empty.

Use **staging credentials and test accounts only**. Do not move real customer wallet funds. Do not invent provider success payloads.

Current expected behavior with flags default (`false`):

| Call | Expected |
|------|----------|
| `POST /api/gokwik/apply-wallet-credit` | `400` / `GOKWIK_WALLET_DISABLED` |
| `POST /api/gokwik/remove-wallet-credit` | `400` / `GOKWIK_WALLET_DISABLED` |
| Ordinary get-cart / create-order | Unchanged; `wallet_credit_used: 0` |

If staging temporarily sets `GOKWIK_WALLET_REDEMPTION_ENABLED=true` **before** blockers clear:

| Call | Expected |
|------|----------|
| apply / remove | `503` / `GOKWIK_WALLET_CONTRACT_INCOMPLETE` + `openQuestions` |
| Ledger / reservations | **No** new holds or debits |

---

## 1. Callback authentication

- [ ] Missing `Authorization` → `401`
- [ ] Invalid Bearer → `401`
- [ ] Valid `gokwik_checkout` Bearer but wrong cart owner → rejected by `GokwikCartOwnerGuard`
- [ ] Tokens never appear in application logs

## 2. Cart totals (read-only / mapper)

- [ ] Cart mapper still emits integer rupee totals via `toGokwikAmount`
- [ ] `wallet_credit_used` remains `0` while redemption disabled
- [ ] Fixtures: ₹0, ₹100.00; confirm fractional cart lines still round as existing mapper (non-wallet fields)

## 3. Apply / remove (disabled & blocked modes)

- [ ] Flag off → `GOKWIK_WALLET_DISABLED`, no DB wallet mutation
- [ ] Flag on + blockers → `GOKWIK_WALLET_CONTRACT_INCOMPLETE`, no DB wallet mutation
- [ ] Missing `cart_id` → `400`
- [ ] COD / pp-cod policy covered by unit tests (`assertPaymentMethodAllowsWallet`)

## 4. Checkout lifecycle (ordinary GoKwik)

- [ ] Prepaid checkout without wallet completes as today
- [ ] COD checkout without wallet completes as today
- [ ] No regression on create-order / transaction webhook for non-wallet orders

## 5. Webhook correlation (observation only)

- [ ] Document `paymentId` → `gokwik_orders` → Cureka order for a staging prepaid order
- [ ] Confirm amount check behavior on mismatch (existing quarantine path)
- [ ] **Do not** attempt wallet consume — settlement still blocked

## 6. Cancellation / abandoned checkout

- [ ] Note whether GoKwik sends any merchant signal after abandon (record evidence)
- [ ] Without a guaranteed signal, keep live reserve disabled

## 7. Provisional planning (automated / dry-run)

Covered by unit tests (no staging funds):

- [x] Eligibility = min(usable balance, cart total) in paise
- [x] Floor to whole rupees (₹0.01 / ₹125.50 cases)
- [x] Idempotency key + fingerprint stability
- [x] Material cart change → `requiresReleaseReplace`
- [x] Settlement gate throws `GOKWIK_WALLET_SETTLEMENT_BLOCKED`

## 8. Native wallet regression (separate)

- [ ] Razorpay/Cashfree wallet checkout still gated by `WALLET_CHECKOUT_ENABLED=false`
- [ ] Refund → wallet approve path still works independently of GoKwik redemption

---

## Exit criteria to consider live staging redemption

1. Written GoKwik answers for all eight register questions.
2. `GOKWIK_WALLET_LIVE_BLOCKERS` empty in code after review.
3. Full automated suite green including settlement / race cases.
4. Staging soak with test wallets only; then production decision.
