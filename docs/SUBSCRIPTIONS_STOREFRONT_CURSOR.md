# Subscribe & Save — Storefront Cursor Handoff

Paste this into the **customer storefront** Cursor. Inspect the existing frontend first. **Do not replace working GoKwik or native checkout.** Subscribe & Save is an extra line type on the existing cart + the subscription management APIs below.

This file documents **only implemented backend behavior**. Anything labelled **UNAVAILABLE** must not be shown as working AutoPay.

---

## 0. Non-negotiable rules

1. Open the current checkout, cart, PDP, and account code. Reuse session cookies, response wrappers, and payment SDKs already in the app.
2. GoKwik enabled → first payment still goes through GoKwik (`POST /api/v1/payment-requests/checkout` or `/checkout/modal`).
3. Native checkout enabled → first payment still goes through Razorpay/Cashfree as today.
4. **One-time payment is not mandate authorisation.** Never tell the customer “AutoPay is on” after the first product payment alone.
5. **Do not trust redirects** (success URLs, UPI app return, Checkout.js `handler`) as proof of payment or mandate. Always confirm with a GET.
6. A paid first order stays valid if mandate setup fails. Show “subscription active, AutoPay not set up” — not an order failure.
7. `BI_MONTHLY` means **every 2 months**. Label it that way. Never “twice a month”.
8. Recurring AutoPay is **off for this merchant until the backend says `autopayAvailable` / `autopayReady`**. Manual payment links are the default renewal path.
9. Mixed carts **are supported**: one checkout, subscription discount only on subscription lines.
10. On logout, drop subscription list/detail cache, mandate session payloads, and checkout extras (`razorpayOrderId`, `paymentSessionId`, `keyId`).

### Response envelope

Success:

```json
{ "success": true, "data": { }, "message": "…", "timestamp": "…" }
```

Error:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "…",
  "code": "SUBSCRIPTION_CHANGE_CUTOFF",
  "timestamp": "…",
  "path": "/api/v1/subscriptions/products/…"
}
```

Branch on `code` when present. Auth is the existing **session cookie**. Customer mutations require a **verified** user (`SessionCookieGuard` + `VerifiedUserGuard`) — same as orders.

Base path: `/api/v1`.

---

## 1. Inspect existing frontend, then add Subscribe & Save

Preserve:

- Cart, coupons, address book, GoKwik SDK, Razorpay Checkout.js, Cashfree checkout, order confirmation, inventory/prescription/serviceability errors.

Add:

- PDP “Subscribe & Save” toggle + frequency picker.
- Cart line showing subscription price and frequency.
- Account → My Subscriptions list + detail.
- Optional post-purchase “Set up AutoPay” only when the backend offers it.

---

## 2. Product PDP — eligibility and quote

### Public product payload (already exists)

```
GET /api/v1/public/products/:slug
```

Use `subscriptionEnabled` and `subscriptionConfig` when present. If `subscriptionEnabled` is false or `subscriptionConfig` is null, **hide** Subscribe & Save.

### Dedicated config (preferred for the picker)

```
GET /api/v1/subscriptions/products/config?productId={uuid}&productVariantId={uuid}
```

Auth: none. Returns `null` in `data` when disabled.

Example `data` when enabled:

```json
{
  "id": "…",
  "refId": "pscfg…",
  "productId": "…",
  "productVariantId": null,
  "enabled": true,
  "frequencies": ["MONTHLY", "BI_MONTHLY", "QUARTERLY"],
  "discountType": "PERCENTAGE",
  "discountValue": "10.00",
  "minDurationMonths": null,
  "maxDurationMonths": null,
  "pauseAllowed": true,
  "frequencyChangeAllowed": true,
  "cancellationAllowed": true,
  "skipAllowed": true,
  "gracePeriodDays": 7,
  "missedPaymentAction": "PAUSE",
  "renewalMethod": "PAYMENT_LINK",
  "reminderOffsetsJson": [7, 2, 0],
  "quantityChangeAllowed": false,
  "mandateMaxAmount": null,
  "timezone": "Asia/Kolkata",
  "deliveryLeadDays": 2,
  "maxRetryAttempts": 3,
  "changeCutoffHours": 12,
  "intervalLabels": [
    { "frequency": "MONTHLY", "intervalMonths": 1, "label": "Every month" },
    { "frequency": "BI_MONTHLY", "intervalMonths": 2, "label": "Every 2 months" },
    { "frequency": "QUARTERLY", "intervalMonths": 3, "label": "Every 3 months" }
  ],
  "autopayAvailable": false,
  "autopayUnavailableReason": "AutoPay is not enabled for this merchant yet. Recurring cycles use a manual payment link."
}
```

**UI:** If `autopayAvailable` is false, copy must say renewals use a **payment link / checkout**, not AutoPay. Show `autopayUnavailableReason`.

Enums:

- `discountType`: `PERCENTAGE` | `FLAT`
- `missedPaymentAction`: `PAUSE` | `EXPIRE`
- `renewalMethod` on config is a product default; **do not** treat it as the customer’s live AutoPay state.

### Quote (guest)

```
GET /api/v1/subscriptions/products/quote?productId={uuid}&productVariantId={uuid}&quantity=1&frequency=MONTHLY
```

### Quote (logged-in, includes membership discount if any)

```
GET /api/v1/subscriptions/products/quote/me?productId={uuid}&productVariantId={uuid}&quantity=1&frequency=MONTHLY
```

Auth: session + verified.

Example `data`:

```json
{
  "productId": "…",
  "productVariantId": "…",
  "quantity": 1,
  "frequency": "MONTHLY",
  "intervalMonths": 1,
  "intervalLabel": "Every month",
  "catalogUnitPrice": "499.00",
  "subscriptionPrice": "499.00",
  "discountAmount": "49.90",
  "finalAmount": "449.10",
  "memberDiscountApplied": false,
  "mixedCart": {
    "supported": true,
    "behavior": "One-time and Subscribe & Save items may share a cart. Subscription discount applies only to subscription lines. First payment uses existing GoKwik or native checkout. The paid order is created once; each subscription line is activated afterwards."
  },
  "firstPayment": {
    "routedThroughExistingCheckout": true,
    "isMandateAuthorization": false
  },
  "autopay": {
    "enabled": false,
    "ready": false,
    "requiresSeparateMandateSetup": true
  }
}
```

Never display a client-calculated subscription price as the charge amount. Re-quote when variant, qty, or frequency changes.

Loading / empty / unavailable:

- Config `null` → one-time buy only.
- Quote 400 “Product is not available for subscription” / frequency not allowed → disable that option.
- Network error → keep last quote, show retry.

---

## 3. First payment — use existing cart checkout (required path)

```
POST /api/v1/cart/items
```

Auth: session (same as cart today).

```json
{
  "productId": "uuid",
  "variantId": "uuid",
  "quantity": 1,
  "isSubscription": true,
  "frequency": "MONTHLY"
}
```

`frequency` is required when `isSubscription` is true (`MONTHLY` | `BI_MONTHLY` | `QUARTERLY`).

Then **do not invent a new pay flow**:

```
POST /api/v1/payment-requests/checkout
POST /api/v1/payment-requests/checkout/modal
POST /api/v1/payment-requests/checkout/modal/verify   // native only, not GoKwik
POST /api/v1/payment-requests/checkout/modal/cancel   // native dismiss
```

Optional header: `Idempotency-Key`.

GoKwik: open the existing SDK with `paymentData` from checkout (`customerToken` is opaque — never the HttpOnly session). GoKwik confirms via merchant callbacks; do not call modal verify.

Native: open Razorpay/Cashfree with **server** `paymentData.amount` / `paymentSessionId`. After SDK success, call `checkout/modal/verify`, then poll order/subscription — **do not** mark paid from the SDK callback alone.

Prescription, stock, serviceability, COD rules: existing checkout errors. Do not weaken them.

### After a paid order

The backend activates each subscription line automatically. Fallback if the account page is empty:

```
POST /api/v1/subscriptions/products/from-paid-order
```

Auth: session + verified.

```json
{
  "orderRef": "CUR2026000001",
  "productId": "uuid",
  "productVariantId": "uuid",
  "frequency": "MONTHLY",
  "quantity": 1,
  "addressId": "uuid"
}
```

`orderRef` may be order number, order id, order refId, or payment-request refId. This **does not charge again**.

400 if the paid order is not found yet — wait and retry from Subscriptions.

### Standalone subscribe (optional; not a replacement for cart)

```
POST /api/v1/subscriptions/products
```

```json
{
  "productId": "uuid",
  "productVariantId": "uuid",
  "quantity": 1,
  "frequency": "MONTHLY",
  "addressId": "uuid",
  "termsAccepted": true
}
```

Returns a subscription in `PENDING_PAYMENT` plus checkout extras (`razorpayOrderId`, `keyId`, `paymentSessionId`, `paymentLink`, `amount`, `currency`, `customer`). Complete that session, then:

```
POST /api/v1/subscriptions/products/:id/verify-payment
```

```json
{
  "razorpay_order_id": "order_…",
  "razorpay_payment_id": "pay_…",
  "razorpay_signature": "…"
}
```

Cashfree standalone sessions are confirmed by webhook, not this Razorpay-only verify route. Prefer cart checkout for a single consistent UX.

---

## 4. Mandate / AutoPay UX (separate screen)

**UNAVAILABLE by default.** Call config/quote/`GET …/mandate` before showing “Enable AutoPay”.

```
POST /api/v1/subscriptions/products/:id/mandate/authorize
```

Auth: session + verified. No body.

Success `data` example (shape when AutoPay **is** enabled on the merchant):

```json
{
  "mandateId": "…",
  "status": "PENDING",
  "provider": "RAZORPAY",
  "maxAmount": "2000.00",
  "currency": "INR",
  "authorization": {
    "provider": "RAZORPAY",
    "authorizationOrderId": "order_…",
    "gatewayCustomerId": "cust_…",
    "keyId": "rzp_…",
    "amountPaise": 100,
    "currency": "INR",
    "checkoutPayload": {
      "key": "rzp_…",
      "order_id": "order_…",
      "customer_id": "cust_…",
      "recurring": "1",
      "amount": 100,
      "currency": "INR"
    }
  },
  "note": "Mandate authorisation is not proof of a product payment. Confirm status via GET /subscriptions/products/:id/mandate."
}
```

Cashfree session uses `authorization.paymentSessionId` / `authorizationLink` / `checkoutPayload.subscription_session_id`.

The authorisation amount (₹1) is **not** the product price. Copy must say they are approving a recurring debit **up to** `maxAmount`.

400 `code: SUBSCRIPTION_AUTOPAY_UNAVAILABLE` — hide AutoPay, keep subscription + manual renewals.

After return from UPI/bank:

```
GET  /api/v1/subscriptions/products/:id/mandate
POST /api/v1/subscriptions/products/:id/mandate/refresh
```

Mandate GET `data`:

```json
{
  "autopayReady": false,
  "autopayFeatureEnabled": false,
  "mandate": {
    "id": "…",
    "status": "PENDING",
    "provider": "RAZORPAY",
    "maxAmount": "2000.00",
    "currency": "INR",
    "validUntil": null,
    "authorizedAt": null
  }
}
```

`mandate.status`: `PENDING` | `AUTHORIZED` | `CONFIRMED` | `PAUSED` | `FAILED` | `EXPIRED` | `REVOKED` | `CANCELLED`.

Show AutoPay as on **only** when `autopayReady === true`. Poll GET mandate every 3–5s for ~60s after return, then stop and offer Refresh.

Partial-success screens:

- Product paid, mandate pending → “We’ll send a payment link before each delivery until AutoPay is set up.”
- Mandate failed → same, plus retry authorize if `allowedActions.setupMandate`.
- Customer abandoned bank screen → stay PENDING; do not mark the order failed.

---

## 5. My Subscriptions

### List (paginated)

```
GET /api/v1/subscriptions/products?page=1&limit=20
```

Optional: `search`, `sortBy`, `sortOrder=ASC|DESC` (pagination DTO).

```json
{
  "items": [ { "id": "…", "refId": "ups…", "status": "ACTIVE", "autopayReady": false } ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Empty: “No subscriptions yet” + shop CTA.

### Detail

```
GET /api/v1/subscriptions/products/:id
GET /api/v1/subscriptions/products/:id/payments
GET /api/v1/subscriptions/products/:id/cycles
GET /api/v1/subscriptions/products/:id/history
```

`:id` is UUID.

Subscription fields (detail):

| Field | Notes |
| --- | --- |
| `status` | `PENDING_PAYMENT` \| `ACTIVE` \| `RENEWAL_PAYMENT_PENDING` \| `PAUSED` \| `PAST_DUE` \| `CANCELLED` \| `EXPIRED` |
| `frequency` / `intervalLabel` / `intervalMonths` | Display `intervalLabel` |
| `nextBillingDate` | Charge date (ISO) |
| `nextDeliveryDate` | Estimate, distinct from charge |
| `timezone` | Default `Asia/Kolkata` |
| `renewalMethod` | `AUTO_PAY` only if `autopayReady`; else `PAYMENT_LINK` |
| `autopayReady` | Source of truth for AutoPay badge |
| `finalAmount` | Last quoted cycle amount; recurrences are re-priced server-side |
| `allowedActions` | Drive all buttons |
| `product` / `variant` / `productImageUrl` | Display |

`allowedActions`:

```json
{
  "pause": true,
  "resume": false,
  "skip": true,
  "cancel": true,
  "changeFrequency": true,
  "changeAddress": true,
  "changeQuantity": false,
  "setupMandate": true,
  "retryPayment": false
}
```

Disable buttons when the corresponding flag is false (cutoff, in-flight cycle, or product config).

Cycle row:

```json
{
  "id": "…",
  "refId": "…",
  "billingCycleRef": "2026-10",
  "sequence": 2,
  "status": "LINK_GENERATED",
  "chargeDate": "…",
  "estimatedDeliveryDate": "…",
  "amount": "449.10",
  "currency": "INR",
  "orderId": null,
  "paymentId": "…",
  "skipReason": null,
  "failureReason": null,
  "retryCount": 0
}
```

Cycle `status`: `SCHEDULED` | `SKIPPED` | `NOTIFICATION_SENT` | `DEBIT_PENDING` | `LINK_GENERATED` | `PAID` | `PAID_ORDER_PENDING` | `FAILED` | `EXHAUSTED`.

`PAID_ORDER_PENDING`: money captured, order still being created — show “Payment received, order processing”. Do not collect another payment.

Payment attempt: `status` `PENDING` | `LINK_GENERATED` | `RECONCILING` | `PAID` | `FAILED` | `EXPIRED` | `CANCELLED`; `attemptKind` `AUTOPAY` | `MANUAL_LINK` | `FIRST_ORDER`.

---

## 6. Customer actions

All `POST`/`PATCH` below: session + verified. Success returns the updated subscription (same shape as GET detail) unless noted.

### Pause

```
POST /api/v1/subscriptions/products/:id/pause
{ "reason": "optional, max 500" }
```

### Resume

```
POST /api/v1/subscriptions/products/:id/resume
```

### Skip next cycle

```
POST /api/v1/subscriptions/products/:id/skip-next
```

Immediately advances `nextBillingDate`. The skipped cycle is stored as `SKIPPED`. This is not a full cancel.

### Cancel

```
POST /api/v1/subscriptions/products/:id/cancel
{ "reason": "optional" }
```

Stops **future** cycles. Does **not** cancel or refund already-paid orders. Use existing order cancellation / refund UI for those.

Confirm copy: “Your subscription will stop. Orders already placed are unchanged.”

### Frequency

```
PATCH /api/v1/subscriptions/products/:id/frequency
{ "frequency": "QUARTERLY" }
```

### Address

```
PATCH /api/v1/subscriptions/products/:id/address
{ "addressId": "uuid" }
```

Must be an address owned by the user (existing address book).

### Quantity (usually disabled)

```
PATCH /api/v1/subscriptions/products/:id/quantity
{ "quantity": 2 }
```

400 `SUBSCRIPTION_QUANTITY_CHANGE_DISABLED` unless the product allows it.

### Retry / pay unpaid cycle

```
POST /api/v1/subscriptions/products/:id/retry-payment
POST /api/v1/subscriptions/products/:id/cycles/:cycleId/pay
```

Both create/reuse a **manual** checkout session for the unpaid cycle (same extras as create). Use existing Razorpay/Cashfree UI. Then verify Razorpay via `POST …/verify-payment` or wait for webhook + poll GET.

400 `SUBSCRIPTION_CYCLE_ALREADY_PAID` — stop charging, refresh cycles.

400 `SUBSCRIPTION_CYCLE_IN_FLIGHT` — AutoPay debit already running; poll, do not open a second checkout.

400 `SUBSCRIPTION_CHANGE_CUTOFF` — cycle already in notification/debit/fulfillment or within `changeCutoffHours` of charge. Hide pause/skip/edits.

Statuses that allow retry: `PENDING_PAYMENT`, `RENEWAL_PAYMENT_PENDING`, `PAST_DUE`.

Polling: after payment UI, poll GET detail + cycles every 3s for ~2 minutes. Stop when cycle `PAID` or `PAID_ORDER_PENDING`, or payment `PAID`.

---

## 7. Error codes (subscription)

| `code` | Meaning |
| --- | --- |
| `SUBSCRIPTION_AUTOPAY_UNAVAILABLE` | Do not offer AutoPay |
| `SUBSCRIPTION_MANDATE_LIMIT_EXCEEDED` | Amount above mandate max — use manual pay |
| `SUBSCRIPTION_MANDATE_NOT_CONFIRMED` | Mandate not ready |
| `SUBSCRIPTION_CYCLE_LOCKED` | Cycle locked |
| `SUBSCRIPTION_CYCLE_ALREADY_PAID` | Do not charge again |
| `SUBSCRIPTION_CYCLE_IN_FLIGHT` | Debit in progress |
| `SUBSCRIPTION_CHANGE_CUTOFF` | Too close to charge / in flight |
| `SUBSCRIPTION_QUANTITY_CHANGE_DISABLED` | Hide qty editor |
| `SUBSCRIPTION_LEGACY_MANDATE_REQUIRED` | Legacy row needs new authorisation |
| `SUBSCRIPTION_PROVIDER_MISMATCH` | Mandate provider ≠ checkout toggle (backend keeps original provider) |
| `SUBSCRIPTION_MIXED_CART_UNSUPPORTED` | Reserved; mixed carts **are** supported today — do not expect this on happy path |

401/403: existing session behaviour. 404: “Subscription not found” — wrong id or not owned.

---

## 8. Loading, failure, logout

- List skeleton → empty / error retry.
- Detail 404 → not found.
- Mandate authorize 400 AutoPay unavailable → informational, not a crash.
- Logout: clear React Query / Redux keys for `subscriptions/products`, mandate sessions, payment extras.

---

## 9. Frontend acceptance checklist

- [ ] One-time PDP purchase unchanged.
- [ ] GoKwik cart checkout still places mixed and non-subscription carts.
- [ ] Native Razorpay/Cashfree checkout still places mixed and non-subscription carts.
- [ ] Subscribe & Save only when config enabled; frequencies match `intervalLabels`.
- [ ] `BI_MONTHLY` labelled “Every 2 months”.
- [ ] Quote `finalAmount` used in PDP; cart totals still come from `GET /cart`.
- [ ] First payment never described as AutoPay.
- [ ] After paid order, subscription appears without a second charge.
- [ ] Mandate screen hidden unless `autopayAvailable` or `allowedActions.setupMandate`.
- [ ] Redirect after mandate is followed by GET mandate; AutoPay badge only if `autopayReady`.
- [ ] Pause / resume / skip / cancel / frequency / address respect `allowedActions` and cutoff errors.
- [ ] Quantity editor hidden unless `changeQuantity`.
- [ ] Manual cycle pay does not open if cycle already paid or debit pending.
- [ ] Polling does not treat SDK success as paid.
- [ ] Logout clears subscription cache.
- [ ] Failed recurring charge is **not** offered as COD.

---

## 10. UNAVAILABLE backend capabilities

Do **not** build UI that claims these work:

- Juspay / Stripe checkout for subscriptions.
- GoKwik AutoPay / mandate.
- Live AutoPay while `autopayAvailable` / `autopayReady` are false (current default).
- SMS/email/WhatsApp subscription receipts (backend logs only; MSG91 templates not configured).
- Changing AutoPay provider when the checkout toggle changes (mandate stays on original provider).
- Admin-set arbitrary debit amount from the storefront.
- Treating mandate ₹1 auth as the product payment.

Membership plans remain a **separate** existing feature (`/api/v1/memberships/...`). Reuse member discount on quotes when logged in; do not invent a new membership product.
