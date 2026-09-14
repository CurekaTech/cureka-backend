# Subscribe & Save — Backend Developer Guide

This document describes the **implemented** Cureka product-subscription (Subscribe & Save) backend. It is not a design proposal. Do not treat AutoPay as live until merchant Recurring/Subscriptions products are activated and `SUBSCRIPTION_AUTOPAY_ENABLED=true`.

- API prefix: `/api/v1`
- First-order checkout: **unchanged** GoKwik / native Razorpay / Cashfree routing
- Recurring AutoPay: **disabled by default**, gated separately from the checkout toggle
- Juspay: **not implemented** (SOW discrepancy; see §14)

---

## 1. Audit findings

### Already working (reused, not replaced)

- Product `subscriptionEnabled` + nested `subscriptionConfig` on create/update product.
- Cart line `isSubscription` + `frequency`; mixed one-time + subscription carts.
- Checkout pricing applies Subscribe & Save discount **only** to subscription lines.
- First order placement through `POST /payment-requests/checkout` and `POST /payment-requests/checkout/modal`.
- `OrdersService.activateSubscriptionsForConfirmedOrder` after a confirmed paid order (also `OrderConfirmedSubscriptionListener`).
- Membership plans/benefits as an **optional extra discount** on subscription pricing (`MembershipBenefitsApplicationService`).
- Payment-link / checkout-session renewals (`SubscriptionPaymentLinkService`) using the existing Razorpay/Cashfree one-time payment stack.
- Unique `(subscription_id, billing_cycle_ref)` on `subscription_payments`.
- BullMQ queues `product-subscription-renewal` (`0 3 * * *`) and `product-subscription-reminder` (`0 9 * * *`).
- Customer pause / resume / cancel / skip / frequency / address.
- Admin list + payments list + RBAC codes `user_product_subscriptions.*` and `subscription_payments.*`.

### Partial or broken (corrected in this work)

- `VerifyProductSubscriptionPaymentDto` existed with **no** `POST :id/verify-payment` route — added.
- Mandate columns existed (`gateway_mandate_id`, `AUTO_PAY`) but **no** mandate create/charge path; renewal always used payment links and `getActiveGateway()` (checkout toggle).
- Billing cycle conflated with payment attempt — split into `subscription_billing_cycles` + `subscription_payments`.
- No quote API, customer pagination, quantity update, mandate APIs, cycle pay, admin pause/resume/cancel/skip/retry.
- `AUTO_PAY` rows without a verified mandate would have been eligible for debit after a naive migration — locked to `PAYMENT_LINK` + `autopay_ready=false`.
- Cashfree refund webhooks were briefly able to be treated as payment success — restored to refund-only handling.
- Cashfree official webhook name is `SUBSCRIPTION_STATUS_CHANGED` (handler now accepts that and the previous `SUBSCRIPTION_STATUS_CHANGE` alias).

### Duplicate / conflicting logic

- First-order activation is both inlined in `OrdersService` **and** available via `POST /subscriptions/products/from-paid-order`. The listener is a safety net; the service path is idempotent by paid-order + product/variant.
- Standalone `POST /subscriptions/products` still creates a pending subscription + **manual** checkout session. That is **not** the cart checkout path. Prefer cart + existing checkout for first payment.

### Missing / unavailable (not faked)

- Juspay orchestration.
- GoKwik mandate / AutoPay (unverified; first order still uses GoKwik when that checkout flag is on).
- Stripe.
- MSG91 subscription SMS templates (notifications log only).
- Email / WhatsApp subscription channels.
- Production AutoPay: merchant Recurring (Razorpay) / Subscriptions (Cashfree) account activation is **not** proven by one-time checkout credentials.
- Shared-mandate revocation across subscriptions (ownership is **1:1**; cancelling one subscription does not revoke a mandate belonging to another).

### Files changed (primary)

| Area | Path |
| --- | --- |
| Config | `apps/api/config/subscriptions.config.ts`, `apps/api/config/index.ts`, `apps/api/config/env.validation.ts`, `apps/api/app.module.ts` |
| Migration | `apps/api/database/migrations/1785982000000-harden-product-subscriptions.ts` |
| Module | `modules/subscription/**` (entities, repos, services, providers, controllers, processors, tests) |
| Webhooks | `modules/payment-requests/controllers/payments-webhook.controller.ts` |
| Admin menu | `modules/auth/services/admin-auth.service.ts` |
| Audit types | `modules/master/constants/audit-entity-type.constant.ts` |

Checkout, cart, GoKwik, Razorpay/Cashfree **one-time** payment modules were not replaced.

---

## 2. Architecture and source-file map

```
Customer PDP / cart
  GET  /subscriptions/products/config
  GET  /subscriptions/products/quote[/me]
  POST /cart/items  { isSubscription, frequency }     ← existing cart
  POST /payment-requests/checkout[/modal]             ← existing checkout
       └─ paid order
            └─ OrdersService.activateSubscriptionsForConfirmedOrder
                 └─ ProductSubscriptionsService.activateFromPaidOrder

Standalone subscribe (no cart)
  POST /subscriptions/products                        ← pending + payment session
  POST /subscriptions/products/:id/verify-payment     ← Razorpay signature

Mandate (separate from first payment)
  POST /subscriptions/products/:id/mandate/authorize
  GET  /subscriptions/products/:id/mandate
  POST /subscriptions/products/:id/mandate/refresh

Recurring
  BullMQ daily-renewal → processRenewals
    Redis lock product-renewal-run + per-subscription renewal:{id}
    AutoPay only if flag + confirmed mandate + amount ≤ max
    else payment link on the **mandate's original provider**
  Webhooks → handlePaymentSuccess / handlePaymentFailed / mandate status
  finalizePaidCycles retries order creation without charging again
```

Key services:

- `ProductSubscriptionsService` — customer/admin lifecycle, renewal, payment success
- `SubscriptionMandateService` — never presents AutoPay unless flag + confirmed mandate
- `RazorpayRecurringProvider` / `CashfreeSubscriptionProvider` — official Recurring / Subscriptions APIs, gated
- `SubscriptionBillingCycleService` — cycle records distinct from payment attempts
- `SubscriptionLockService` — Redis `SET NX PX`, in-process fallback
- `ProductSubscriptionPricingService` — server-side quote
- `SubscriptionPaymentLinkService` — existing gateway checkout session for manual cycles
- `SubscriptionNotificationsService` — SMS templates **not** configured; logs only

---

## 3. Entities, migrations, state

### Concepts (kept separate)

1. **Product subscription** — `user_product_subscriptions`
2. **Gateway mandate** — `subscription_mandates` (1:1 with a subscription)
3. **Billing cycle** — `subscription_billing_cycles` unique `(subscription_id, billing_cycle_ref)`
4. **Payment attempt** — `subscription_payments` unique `(subscription_id, billing_cycle_ref)`
5. **Order** — existing `orders`, linked via `first_order_id` / cycle `order_id` / payment `order_id`

### Subscription status

`PENDING_PAYMENT` | `ACTIVE` | `RENEWAL_PAYMENT_PENDING` | `PAUSED` | `PAST_DUE` | `CANCELLED` | `EXPIRED`

`autopayReady` is **independent**. A paid first order can be `ACTIVE` with `autopayReady=false`.

### Mandate status

`PENDING` | `AUTHORIZED` | `CONFIRMED` | `PAUSED` | `FAILED` | `EXPIRED` | `REVOKED` | `CANCELLED`

AutoPay presentation requires: feature flag + `autopayReady` + `renewalMethod=AUTO_PAY` + mandate `AUTHORIZED` or `CONFIRMED`.

### Cycle status

`SCHEDULED` | `SKIPPED` | `NOTIFICATION_SENT` | `DEBIT_PENDING` | `LINK_GENERATED` | `PAID` | `PAID_ORDER_PENDING` | `FAILED` | `EXHAUSTED`

- `PAID_ORDER_PENDING` = money captured, order create failed; scheduler retries **without** a new charge.
- A skipped cycle is not a cancelled subscription.
- A failed payment is not an automatic cancel; missed-payment action is `PAUSE` (default) or `EXPIRE` after grace days.

### Frequencies

| Enum | Months | Label |
| --- | --- | --- |
| `MONTHLY` | 1 | Every month |
| `BI_MONTHLY` | 2 | Every 2 months (**never** twice a month) |
| `QUARTERLY` | 3 | Every 3 months |

Timezone default `Asia/Kolkata`. Charge date uses calendar months with **month-end clamp** to the schedule anchor day. Estimated delivery = charge date + `deliveryLeadDays` (default 2). Charge date ≠ delivery date.

Missed cycles after downtime: **no catch-up storm**. `advancePastMissedCycles` skips overdue intervals and only charges the current due window.

### Migration `1785982000000-harden-product-subscriptions`

Additive tables/columns listed above. Legacy lock:

```
UPDATE user_product_subscriptions
SET renewal_method = 'PAYMENT_LINK', autopay_ready = false
WHERE gateway_mandate_id is empty AND renewal_method = 'AUTO_PAY'
```

Rollback (`down()`): drops new tables/columns. Postgres **cannot** remove enum value `RECONCILING` from `subscription_payment_status_enum`.

Do **not** run this migration against production as part of this task. Do **not** enable live charging.

---

## 4. Initial checkout vs mandate

### Preferred first order (preserve existing checkout)

1. Validate eligibility via `GET /subscriptions/products/config` and quote.
2. `POST /cart/items` with `isSubscription: true` and an allowed `frequency`.
3. Existing `POST /payment-requests/checkout` or `/checkout/modal` (GoKwik if enabled, else native Razorpay/Cashfree).
4. Payment confirmed by existing webhook / `checkout/modal/verify`.
5. Order created **once** by existing order services.
6. `activateSubscriptionsForConfirmedOrder` links the subscription to that order. `autopayReady` remains false.
7. Subsequent cycles are scheduled from the paid order date. Mandate setup is a **later** optional step.

**Mixed carts are supported:** one checkout order; subscription discount only on subscription lines; each subscription line activates after the paid order.

### Standalone subscribe

`POST /subscriptions/products` creates `PENDING_PAYMENT` + a **manual** checkout session (`FIRST_ORDER` attempt). It does not go through the cart. First payment is still not a mandate.

### Partial success (explicit)

| First payment | Mandate | Result |
| --- | --- | --- |
| Paid | Failed / pending / abandoned | Order remains valid; subscription `ACTIVE`; `autopayReady=false`; renewals use payment links |
| Failed / pending | Authorised | Mandate must **not** be treated as product payment; subscription stays `PENDING_PAYMENT` until a verified product payment |
| Paid + webhook only (callback missing) | — | Webhook `handlePaymentSuccess` is idempotent (`markPaidIfUnpaid`) |
| Duplicate callbacks | — | Second success is a no-op |

Never charge the first cycle twice. Never represent a ₹1 / auth-only mandate payment as the product price.

Recurring AutoPay **never** converts a failed debit into COD.

---

## 5. Recurring billing

Daily job `product-subscription-daily-renewal`:

1. Global Redis lock `product-renewal-run` (10 min).
2. `finalizePaidCycles` for `PAID_ORDER_PENDING`.
3. Due subscriptions (`ACTIVE`, `RENEWAL_PAYMENT_PENDING`, `PAST_DUE`).
4. Per-subscription lock `renewal:{id}`.
5. Skip paused/cancelled; skip in-flight/paid cycles.
6. Recalculate amount with current selling price, subscription discount, live membership benefit if any.
7. Freeze cycle `pricing_snapshot`.
8. AutoPay path only when `canPresentAsAutopay` and amount ≤ mandate max; charge **original mandate provider**.
9. Else generate a payment link (manual). `renewalMethod` in API responses is `AUTO_PAY` only when `autopayReady` is true.
10. Amount above mandate max → manual link, never silent over-limit debit.
11. After retries + grace, `missedPaymentAction` pauses (default) or expires. It does **not** cancel paid orders.

Idempotency: unique cycle ref, unique payment cycle, payment `idempotency_key`, webhook `(provider, event_id)`.

---

## 6. Provider capabilities (official docs, not assumed from one-time checkout)

### Razorpay Recurring (UPI Autopay / token)

Implemented against [Razorpay Recurring Payments — UPI authorisation](https://razorpay.com/docs/api/payments/recurring-payments/upi-reserve-pay/authorization-transaction) and `POST /v1/payments/create/recurring`.

| Topic | Implemented / documented |
| --- | --- |
| Account | Recurring Payments must be activated on the merchant. One-time Key ID/Secret is **not** proof. |
| Methods | UPI Autopay authorisation order `method: upi`, `token.frequency: as_presented`, `token.type: single_block_multiple_debit` |
| Amount | Variable, capped by `token.max_amount` (paise). NPCI/MCC AFA rules (e.g. PIN above ₹15,000) are **account/NPCI**, not implemented here. |
| Auth | `POST /v1/customers`, `POST /v1/orders` with token, Checkout.js `recurring: '1'` |
| Charge | New order then `POST /v1/payments/create/recurring` with `token` + `recurring: true` |
| Status | `GET /v1/payments/:id`; webhooks `token.confirmed\|cancelled\|paused\|rejected` |
| Pre-debit | Razorpay/NPCI notification; we do not invent extra NPCI APIs |
| Cancel | Token cancel/revoke via webhook → AutoPay disabled |
| Webhook | `POST /api/v1/payment/webhook` HMAC via existing `RazorpayPaymentLinksService.verifyWebhookSignature` (**raw body** when Fastify provides it) |
| Test mode | Recurring may be unavailable or limited on test keys — treat as blocked until a test mandate confirms |

### Cashfree Subscriptions

Implemented against Cashfree Subscriptions: `POST /pg/subscriptions` (`plan_type: ON_DEMAND`), `POST /pg/subscriptions/pay` with `payment_type: CHARGE`.

| Topic | Implemented / documented |
| --- | --- |
| Account | Subscriptions product must be enabled. Checkout App ID/Secret is **not** proof. |
| Methods | Create allows `upi`, `enach`, `card` in `authorization_details.payment_methods` |
| Amount | Variable up to `plan_max_amount` |
| Auth | `POST /pg/subscriptions`; session id / hosted subscription view |
| Charge | `POST /pg/subscriptions/pay` `CHARGE`; UPI schedule defaults to T+1 |
| Webhooks | `SUBSCRIPTION_AUTH_STATUS`, `SUBSCRIPTION_STATUS_CHANGED`, `SUBSCRIPTION_PAYMENT_SUCCESS`, `SUBSCRIPTION_PAYMENT_FAILED`, `SUBSCRIPTION_PAYMENT_CANCELLED` on `POST /api/v1/payment/webhook/cashfree` |
| Signature | Existing `CashfreePaymentService.verifyWebhookSignature` (same as one-time; uses stringified body) |
| Pre-debit | Default CHARGE lets Cashfree notify; controlled 24h notification APIs are **not** wired |

### GoKwik

Normal checkout works. **Mandate/AutoPay is unverified and not implemented.** First subscription order still uses GoKwik when `gokwikCheckoutEnabled` is on.

### Juspay / Stripe

Not in this repository. Direct Razorpay/Cashfree Recurring does **not** fulfill a Juspay-orchestration SOW. Confirmation required before adding either.

### Routing vs checkout toggle

`SUBSCRIPTION_AUTOPAY_PROVIDER` optionally pins **new** mandates to `RAZORPAY` or `CASHFREE`. An existing mandate **always** keeps its stored provider. Never charge a Razorpay token through Cashfree.

---

## 7. Environment variables (no secret values)

| Name | Default | Meaning |
| --- | --- | --- |
| `SUBSCRIPTION_TIMEZONE` | `Asia/Kolkata` | Calendar-month scheduling |
| `SUBSCRIPTION_DELIVERY_LEAD_DAYS` | `2` | Charge date → estimated delivery |
| `SUBSCRIPTION_MAX_RETRIES` | `3` | Bounded retries (config can override per product) |
| `SUBSCRIPTION_CHANGE_CUTOFF_HOURS` | `12` | Block pause/skip/address/frequency/qty near charge |
| `SUBSCRIPTION_PREDEBIT_HOURS` | `24` | Operational pre-debit window |
| `SUBSCRIPTION_AUTOPAY_ENABLED` | `false` | Master AutoPay switch |
| `SUBSCRIPTION_AUTOPAY_PROVIDER` | empty | `RAZORPAY` \| `CASHFREE` \| empty (use current native gateway for **new** mandates) |
| `SUBSCRIPTION_MANDATE_MAX_AMOUNT` | unset | Global INR ceiling; product `mandateMaxAmount` wins; **null = AutoPay cannot be offered** |
| `SUBSCRIPTION_PAYMENT_LINK_EXPIRY_HOURS` | `72` | Manual cycle session expiry |

Existing: `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_API_VERSION`, `CASHFREE_ENV`, `STOREFRONT_URL`.

No multiplier is applied to mandate max. Admins must set an explicit INR limit.

---

## 8. Security and idempotency

- Session cookie + `VerifiedUserGuard` on customer mutations; ownership by `userId`.
- Admin: JWT + `SUPER_ADMIN`/`ADMIN` + `user_product_subscriptions.read|update` / `subscription_payments.read`.
- Webhook signature verification (Razorpay raw body; Cashfree existing verifier).
- Duplicate webhook `(provider, event_id)` unique constraint.
- Redis locks for scheduler multi-instance.
- Unique cycle/payment constraints.
- Logs redact payment credentials; UPI PIN/CVV/card PAN are never stored.
- Admin retry refused for `PAID`, `PAID_ORDER_PENDING`, `DEBIT_PENDING`.
- Change cutoff + in-flight cycle guard (`NOTIFICATION_SENT`, `DEBIT_PENDING`, `LINK_GENERATED`, `PAID`, `PAID_ORDER_PENDING`).

---

## 9. Notifications

`SubscriptionNotificationsService` will log events (`payment_link`, `activated`, `cancelled`, `renewal_due`, `reminder`) with last-4 phone. MSG91 template IDs for subscriptions are **not** configured. Email/WhatsApp are **not** wired. Renewals are never blocked by notification failure.

---

## 10. Rollout, monitoring, rollback

1. Run migration on a **non-production** database first; verify legacy `AUTO_PAY` rows without `gateway_mandate_id` became `PAYMENT_LINK`.
2. Keep `SUBSCRIPTION_AUTOPAY_ENABLED=false` until a real test mandate authorises and a **sandbox/test** charge succeeds.
3. Set product or global `mandateMaxAmount` before offering AutoPay UI.
4. Monitor: BullMQ `product-subscription-renewal` / `reminder`, `subscription_billing_cycles.status`, `PAID_ORDER_PENDING` count, webhook 4xx/5xx, mandate `FAILED`/`REVOKED`.
5. Rollback app deploy; optionally `migration:revert` (enum value `RECONCILING` remains). Do not force-enable AutoPay on revert.

Paid orders are independent of subscription cancel. Refunds use existing admin-approved refund flows.

---

## 11. Tests executed

See §15 in the task report. Automated coverage:

- Pricing, month-end/IST schedule, missed-cycle skip, mandate amount, cycle guards, lock contention, payment idempotency, webhook unique insert, AutoPay presentation, first-payment vs mandate, checkout-toggle vs mandate provider, mixed-cart documentation, existing checkout/GoKwik unit tests, admin menu filter.

Not an e2e live charge. Not a production merchant Recurring activation test.

---

## 12. Customer / admin HTTP map (implemented)

Customer controller: `modules/subscription/controllers/product-subscriptions.controller.ts` → `/subscriptions/products`.

Admin controller: `modules/subscription/controllers/admin-product-subscriptions.controller.ts` → `/admin/subscriptions/products`.

Product settings: `POST|PATCH /products` with `subscriptionEnabled` + `subscriptionConfig` (`modules/product/controllers/products.controller.ts`).

Exact request/response contracts: `docs/SUBSCRIPTIONS_STOREFRONT_CURSOR.md` and `docs/SUBSCRIPTIONS_ADMIN_CURSOR.md`.

---

## 13. Pricing, schedule, cancellation

- Base = variant `sellingPrice` × qty.
- Subscription discount (`PERCENTAGE` or `FLAT`) then optional membership discount.
- Recurring amount is **recalculated** at cycle freeze (variable AutoPay).
- Skip next: immediately advances `nextBillingDate` and marks that cycle `SKIPPED` (`CUSTOMER_SKIP`).
- Cancel: future cycles stop; `autopayReady=false`; **does not** cancel/refund existing orders.
- Pause: no debit while `PAUSED`. Resume → `ACTIVE`.

---

## 14. SOW ambiguities and decisions

| Topic | Decision |
| --- | --- |
| Juspay as primary orchestration | **Not implemented.** Direct Razorpay/Cashfree Recurring is not a substitute. Needs product confirmation. |
| Mandate max amount | Explicit admin/env INR ceiling. No silent multiplier. |
| `BI_MONTHLY` | Every **two calendar months**. |
| Mixed cart | **Supported** as one existing checkout order. |
| Missed cycles after downtime | Skip catch-up; charge current window only. |
| Mandate ownership | 1:1 with subscription. Cancel does not revoke another subscription’s mandate. |
| GoKwik mandates | Unavailable / unverified. First order still uses GoKwik checkout. |
| Quantity change | Off by default (`quantityChangeAllowed`). |
| Reminder exhaustion | Pause or expire per `missedPaymentAction`; do not auto-cancel the whole subscription silently. |
| First-order COD | Allowed only if existing checkout would allow it. Recurring cycles are prepaid only. |

---

## 15. Remaining blockers

1. Merchant Razorpay Recurring and/or Cashfree Subscriptions **account activation** (unverified).
2. `SUBSCRIPTION_AUTOPAY_ENABLED` must stay `false` until a test mandate + test charge succeed.
3. `mandateMaxAmount` must be set on the product or env.
4. MSG91 / email / WhatsApp templates.
5. Juspay (if still required by SOW).
6. Live webhook URL registration for Recurring/Subscriptions events on the merchant dashboard.
7. Production charging was **not** enabled or executed in this task.
