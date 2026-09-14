# Subscribe & Save — Admin Panel Cursor Handoff

Paste this into the **admin-panel** Cursor. Inspect existing admin code first: JWT auth, `GET /api/v1/admin/auth/menu`, table/filter/pagination patterns, confirmation dialogs, and audit pages. Follow those patterns. Do not invent a second product editor.

This file documents **implemented** APIs only. Capabilities labelled **UNAVAILABLE** must be shown as disabled or omitted.

---

## 0. Contract

- Base path: `/api/v1`
- Auth: `Authorization: Bearer <admin JWT>`
- Roles on subscription admin routes: `SUPER_ADMIN`, `ADMIN`
- Success: `{ success, data, message, timestamp }` — only `data` is described below
- Error: `{ success: false, statusCode, error, message, code?, timestamp, path }` — branch on `code` when present

`BI_MONTHLY` = every **2 calendar months**, never twice a month.

Cancelling a subscription **stops future cycles**. It does **not** cancel or refund paid orders. Use existing Orders / Refund Requests screens for those.

AutoPay is **off by default** (`SUBSCRIPTION_AUTOPAY_ENABLED=false`). Do not display “AutoPay healthy” unless `autopayReady` is true **and** mandate status is `AUTHORIZED` or `CONFIRMED`.

---

## 1. Sidebar

`GET /api/v1/admin/auth/menu` now includes **Subscription & Membership** when the admin has the listed permissions. Render the menu the server returns.

```
Subscription & Membership
├── Membership Plans          membership_plans.read          → /memberships/plans
├── User Memberships          user_memberships.read          → /memberships/users
├── Membership Payments       membership_payments.read       → /memberships/payments
├── Product Subscriptions     user_product_subscriptions.read → /subscriptions/products
├── Subscription Payments     subscription_payments.read     → /subscriptions/payments
└── Failed Renewals           subscription_payments.read     → /subscriptions/payments?status=FAILED
```

Detail (not in the sidebar): `/subscriptions/products/:idOrRefId`.

Product Subscribe & Save settings live on the **existing product create/edit** screens (`/products/:refId`), not a separate policy app.

Membership screens are a **separate** existing system. Do not merge them into product subscriptions.

---

## 2. Permissions

| Code | Grants |
| --- | --- |
| `user_product_subscriptions.read` | List + detail (mandate, cycles, payments, history) |
| `user_product_subscriptions.update` | Pause, resume, cancel, skip, safe cycle retry |
| `subscription_payments.read` | Payments list / failed renewals |
| `user_product_subscriptions.create` / `.status` / `.delete` | Seeded CRUD codes; **no extra product-subscription endpoints** use them today |
| Product create/update | Existing product admin roles (`SUPER_ADMIN`, `ADMIN` on `POST/PATCH /products`) |

Hide buttons the JWT cannot call. The server still enforces RBAC.

Admin mutations write `audit` with entity type `product_subscription` (pause, retry-cycle, etc.).

---

## 3. Product subscription settings

Reuse product create/update.

```
POST /api/v1/products
PATCH /api/v1/products/:refId
GET  /api/v1/products/:refId
```

JSON or multipart (same as today). When `subscriptionEnabled` is true, send nested `subscriptionConfig`.

```json
{
  "subscriptionEnabled": true,
  "subscriptionConfig": {
    "productVariantId": null,
    "enabled": true,
    "frequencies": ["MONTHLY", "BI_MONTHLY", "QUARTERLY"],
    "discountType": "PERCENTAGE",
    "discountValue": 10,
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
    "mandateMaxAmount": 2000,
    "timezone": "Asia/Kolkata",
    "deliveryLeadDays": 2,
    "maxRetryAttempts": 3,
    "changeCutoffHours": 12
  }
}
```

Field rules (server-validated):

| Field | Rule |
| --- | --- |
| `frequencies` | Min 1; only `MONTHLY`, `BI_MONTHLY`, `QUARTERLY` |
| `discountType` | `PERCENTAGE` \| `FLAT` |
| `discountValue` | ≥ 0, 2 decimal places |
| `quantityChangeAllowed` | Default **false** |
| `mandateMaxAmount` | Optional absolute **INR** ceiling. **Required before AutoPay can be offered.** No multiplier is applied. |
| `missedPaymentAction` | `PAUSE` (default) or `EXPIRE` after grace — does not auto-cancel paid orders |
| `renewalMethod` | Product default `PAYMENT_LINK` \| `AUTO_PAY`. Live AutoPay still requires env flag + confirmed mandate. |
| `timezone` | Default `Asia/Kolkata` |

`GET` product includes `subscriptionEnabled` and `subscriptionConfig` (product-level row preferred).

Bulk upload still maps “Subscription Available” yes/no; full config is edited on the product form.

`subscriptionEnabled: false` disables all configs for that product.

---

## 4. Subscription list

```
GET /api/v1/admin/subscriptions/products
```

Query:

| Param | Type |
| --- | --- |
| `page` | int ≥ 1, default 1 |
| `limit` | 1–100, default 20 |
| `search` | string (refId / related search as implemented by repository) |
| `status` | `PENDING_PAYMENT` \| `ACTIVE` \| `RENEWAL_PAYMENT_PENDING` \| `PAUSED` \| `PAST_DUE` \| `CANCELLED` \| `EXPIRED` |
| `userId` | UUID |
| `sortBy` / `sortOrder` | pagination DTO |

Permission: `user_product_subscriptions.read`.

```json
{
  "items": [
    {
      "id": "uuid",
      "refId": "ups…",
      "userId": "uuid",
      "status": "ACTIVE",
      "frequency": "MONTHLY",
      "intervalLabel": "Every month",
      "quantity": 1,
      "finalAmount": "449.10",
      "nextBillingDate": "2026-10-10T03:30:00.000Z",
      "nextDeliveryDate": "2026-10-12T03:30:00.000Z",
      "autopayReady": false,
      "renewalMethod": "PAYMENT_LINK",
      "user": {
        "id": "…",
        "refId": "…",
        "firstName": "A",
        "lastName": "B",
        "email": null,
        "mobileNumber": "98…"
      },
      "product": { "id": "…", "name": "…", "slug": "…", "imageUrl": "…" },
      "variant": { "id": "…", "sku": "…", "displayName": "…" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Empty: “No subscriptions”. Loading: existing table skeleton.

Badges:

- AutoPay: only if `autopayReady === true`. Otherwise “Manual renewal”.
- Never show AutoPay from `renewalMethod` alone if `autopayReady` is false (legacy lock).

---

## 5. Payments / failed renewals

```
GET /api/v1/admin/subscriptions/products/payments
```

**Declare this route before `:idOrRefId` in the UI router** (the API already registers `/payments` first).

Query: `page`, `limit`, `search`, `status`, `subscriptionId`, `userId`.

`status`: `PENDING` | `LINK_GENERATED` | `RECONCILING` | `PAID` | `FAILED` | `EXPIRED` | `CANCELLED`.

Failed renewals page: `?status=FAILED`.

Permission: `subscription_payments.read`.

Payment row includes `attemptKind` (`AUTOPAY` | `MANUAL_LINK` | `FIRST_ORDER`), `billingCycleRef`, `amount`, `gatewayOrderId`, `gatewayPaymentId`, `failureReason`, `retryCount`, `orderId`, nested `user` / `product` / `subscription`.

`RECONCILING`: timeout/unknown — **do not** offer a second debit; wait for webhook/scheduler.

---

## 6. Subscription detail

```
GET /api/v1/admin/subscriptions/products/:idOrRefId
```

`:idOrRefId` is UUID or `refId` (e.g. `ups…`).

Permission: `user_product_subscriptions.read`.

`data` is the subscription mapper **plus**:

```json
{
  "mandate": {
    "id": "…",
    "status": "CONFIRMED",
    "provider": "RAZORPAY",
    "maxAmount": "2000.00",
    "currency": "INR",
    "validUntil": null
  },
  "cycles": [
    {
      "id": "…",
      "billingCycleRef": "2026-10",
      "sequence": 2,
      "status": "PAID",
      "chargeDate": "…",
      "estimatedDeliveryDate": "…",
      "amount": "449.10",
      "currency": "INR",
      "orderId": "…",
      "paymentId": "…",
      "skipReason": null,
      "failureReason": null,
      "retryCount": 0
    }
  ],
  "payments": [ ],
  "history": [
    {
      "id": "…",
      "action": "ACTIVATED",
      "fromStatus": "PENDING_PAYMENT",
      "toStatus": "ACTIVE",
      "performedBy": "…",
      "reason": null,
      "details": {},
      "createdAt": "…"
    }
  ]
}
```

`mandate` is `null` when none exists.

Mandate `provider` is **sticky**. If checkout settings later switch to Cashfree, this Razorpay mandate is still Razorpay. There is **no** migrate-mandate API.

Cycle statuses: `SCHEDULED` | `SKIPPED` | `NOTIFICATION_SENT` | `DEBIT_PENDING` | `LINK_GENERATED` | `PAID` | `PAID_ORDER_PENDING` | `FAILED` | `EXHAUSTED`.

Highlight `PAID_ORDER_PENDING`: paid, order create failed — scheduler retries **without charging**. Escalate unrecoverable cases through **existing refund** tools, not a new debit.

History `action`: `CREATED` | `ACTIVATED` | `PAUSED` | `RESUMED` | `SKIPPED` | `CANCELLED` | `FREQUENCY_CHANGED` | `ADDRESS_CHANGED` | `QUANTITY_CHANGED` | `MANDATE_UPDATED` | `PAYMENT_SUCCEEDED` | `PAYMENT_FAILED` | `ORDER_CREATED` | `ORDER_FINALIZATION_RETRY` | `ADMIN_RETRY` | `LEGACY_MANUAL_LOCK` | `AUTOPAY_DISABLED`.

Link `orderId` / `firstOrderId` to the existing order detail route.

---

## 7. Management actions

Permission: `user_product_subscriptions.update`.

Use confirmation dialogs. Disable from `allowedActions` on the payload **and** from cycle state.

### Pause

```
POST /api/v1/admin/subscriptions/products/:idOrRefId/pause
{ "reason": "optional, max 500" }
```

Enable when status is `ACTIVE` or `RENEWAL_PAYMENT_PENDING` and product `pauseAllowed`. Disabled inside change cutoff / in-flight cycle (`SUBSCRIPTION_CHANGE_CUTOFF`).

### Resume

```
POST /api/v1/admin/subscriptions/products/:idOrRefId/resume
```

Only when `PAUSED`.

### Skip next

```
POST /api/v1/admin/subscriptions/products/:idOrRefId/skip-next
```

Advances `nextBillingDate`; marks that cycle `SKIPPED`. Not a full cancel.

### Cancel

```
POST /api/v1/admin/subscriptions/products/:idOrRefId/cancel
{ "reason": "optional" }
```

Confirm: “This stops future deliveries. Paid orders are not cancelled or refunded.”

Sets `autopayReady=false`. Does **not** revoke a mandate on a different subscription (mandates are 1:1).

### Safe retry

```
POST /api/v1/admin/subscriptions/products/:idOrRefId/cycles/:cycleId/retry
```

`:cycleId` is the billing-cycle UUID.

**Refuse (400)** when cycle is `PAID`, `PAID_ORDER_PENDING`, or `DEBIT_PENDING`. Do not expose a free-text debit amount. Do not add a “charge ₹X now” control.

If a payment link already exists (`LINK_GENERATED`), retry is a no-op on charging (scheduler will not duplicate the link). Prefer telling ops to share the existing customer pay path.

There is **no** admin API to start a mandate on the customer’s behalf.

Admin pause/resume/cancel/skip return the **customer-shaped** subscription (not the full admin detail). Refresh `GET :idOrRefId` after mutations. Retry returns full admin detail.

---

## 8. Disabled-button matrix

| Control | Enabled when | Disabled when |
| --- | --- | --- |
| Pause | `allowedActions.pause` | Cutoff, in-flight, already paused/cancelled, `pauseAllowed=false` |
| Resume | status `PAUSED` | Other statuses |
| Skip | `allowedActions.skip` | Cutoff / in-flight / skip not allowed |
| Cancel | not `CANCELLED`/`EXPIRED` and cancellation allowed | Already ended |
| Retry cycle | cycle `FAILED`, `SCHEDULED`, `EXHAUSTED`, or unpaid not in flight | `PAID`, `PAID_ORDER_PENDING`, `DEBIT_PENDING` |
| Change frequency/address/qty | **No admin endpoints** — customer APIs only | — |
| Arbitrary amount debit | **Does not exist** | Always |

---

## 9. Settings and env (ops, not a UI API)

Document in an internal ops note; there is **no** admin HTTP API to flip these:

| Env | Meaning |
| --- | --- |
| `SUBSCRIPTION_AUTOPAY_ENABLED` | Must be `true` plus a real Recurring/Subscriptions activation before AutoPay |
| `SUBSCRIPTION_AUTOPAY_PROVIDER` | Optional `RAZORPAY` / `CASHFREE` for **new** mandates |
| `SUBSCRIPTION_MANDATE_MAX_AMOUNT` | Global INR cap if product omits `mandateMaxAmount` |
| `SUBSCRIPTION_TIMEZONE` | Default `Asia/Kolkata` |
| `SUBSCRIPTION_CHANGE_CUTOFF_HOURS` | Default 12 |
| `SUBSCRIPTION_MAX_RETRIES` | Default 3 |
| `SUBSCRIPTION_PREDEBIT_HOURS` | Default 24 |

Scheduler: BullMQ `product-subscription-renewal` at 03:00 and `product-subscription-reminder` at 09:00 (server TZ of the worker). Multiple API instances share Redis locks.

---

## 10. Error / loading / empty

- 401/403: existing admin session/permission toasts.
- 404: unknown id/refId.
- 400 retry on paid cycle: toast “Retry is not allowed for a paid or in-flight cycle”.
- List empty vs loading: existing table patterns.
- `LEGACY_MANUAL_LOCK` in history: do not attempt AutoPay; customer must authorise a new mandate (when AutoPay is enabled).

---

## 11. Admin acceptance checklist

- [ ] Menu shows Product Subscriptions / Payments only with the right permissions.
- [ ] Product form saves frequencies, discounts, pause/skip/cancel flags, `mandateMaxAmount`, timezone, cutoff, retries.
- [ ] List filters by status and paginates.
- [ ] Detail shows mandate provider, max amount, cycles, attempts, orders, history.
- [ ] AutoPay badge only when `autopayReady`.
- [ ] Pause / resume / skip / cancel confirmations; cancel copy does not promise refunds.
- [ ] Retry hidden/disabled for paid and debit-pending cycles; no amount field.
- [ ] Failed renewals view uses payments `status=FAILED`.
- [ ] Existing one-time checkout, refund, and cancellation admin flows unchanged.
- [ ] Audit log entries appear for pause and retry.

---

## 12. UNAVAILABLE backend capabilities

- Juspay orchestration / Stripe.
- GoKwik mandate management.
- Production AutoPay until merchant Recurring (Razorpay) / Subscriptions (Cashfree) is activated **and** `SUBSCRIPTION_AUTOPAY_ENABLED=true`.
- Admin-initiated mandate authorisation.
- Admin frequency / address / quantity updates (customer APIs only).
- Revoking a shared mandate (not the data model; 1:1).
- SMS/email/WhatsApp subscription templates (logged only).
- Changing a stored mandate’s provider when the storefront checkout toggle changes.
- Catch-up charging every missed cycle after downtime (backend **skips** missed cycles by design).
- Creating refunds from the subscription screen (use existing refund requests).
