# Frontend — Product Subscriptions & Memberships (Website)

**Base URL:** `/api/v1`  
**Auth:** session cookie (`Credentials: include`) + verified user (`SessionCookieGuard` + `VerifiedUserGuard`)  
**Response envelope:** `{ success, data, message, timestamp }`

Two storefront domains:

1. **Product subscriptions** — recurring product purchases via payment link (creates an **order** after payment)
2. **Memberships** — paid plans with benefits (**no order** after payment)

**Do not send prices from the frontend.** Backend calculates amounts.

### Nested display objects (GET / list)

| Domain | Nested fields |
|--------|----------------|
| Product subscriptions | `product`, `variant` (`user` is `null` on customer APIs) |
| Memberships | `plan` (+ `benefits`) |
| Product subscription payments | `product`, `variant`, `subscription` summary |
| Membership payments | `plan` |

Admin list endpoints use `data.items` + `data.meta`. Customer list endpoints return `data` as a plain array.

---

## Enums

### Product subscription frequency
`MONTHLY` | `BI_MONTHLY` | `QUARTERLY`

### Product subscription status
`PENDING_PAYMENT` | `ACTIVE` | `RENEWAL_PAYMENT_PENDING` | `PAUSED` | `PAST_DUE` | `CANCELLED` | `EXPIRED`

### Membership billing cycle
`MONTHLY` | `QUARTERLY` | `YEARLY`

### Membership status
`PENDING_PAYMENT` | `ACTIVE` | `RENEWAL_PAYMENT_PENDING` | `PAST_DUE` | `PAUSED` | `CANCELLED` | `EXPIRED`

### Payment status (subscription / membership payments)
`PENDING` | `LINK_GENERATED` | `PAID` | `FAILED` | `EXPIRED` | `CANCELLED`

---

## Product subscriptions

### 1. Get subscription config (PDP)

```http
GET /api/v1/subscriptions/products/config?productId={uuid}&productVariantId={uuid}
```

| Query | Type | Required | Notes |
|-------|------|----------|--------|
| `productId` | UUID | **Yes** | Product id |
| `productVariantId` | UUID | No | Prefer variant-specific config; falls back to product-level |

**Example**

```http
GET /api/v1/subscriptions/products/config?productId=11111111-1111-1111-1111-111111111111&productVariantId=22222222-2222-2222-2222-222222222222
```

**`data` (sample)**

```json
{
  "id": "...",
  "refId": "...",
  "productId": "...",
  "productVariantId": "...",
  "enabled": true,
  "frequencies": ["MONTHLY", "QUARTERLY"],
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
  "reminderOffsetsJson": [7, 2, 0]
}
```

Use `frequencies` to populate the frequency selector. Only show Subscribe UI when config exists and `enabled === true`.

---

### 2. Create subscription (returns payment link)

```http
POST /api/v1/subscriptions/products
Content-Type: application/json
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `productId` | UUID | **Yes** | |
| `productVariantId` | UUID | **Yes** | |
| `quantity` | int ≥ 1 | **Yes** | |
| `frequency` | enum | **Yes** | Must be allowed by config |
| `addressId` | UUID | **Yes** | Saved user address |
| `termsAccepted` | boolean | No | Default treated as accepted if omitted |

**Payload**

```json
{
  "productId": "11111111-1111-1111-1111-111111111111",
  "productVariantId": "22222222-2222-2222-2222-222222222222",
  "quantity": 1,
  "frequency": "MONTHLY",
  "addressId": "33333333-3333-3333-3333-333333333333",
  "termsAccepted": true
}
```

**`data` (sample)** — open `paymentLink` in browser / WebView

```json
{
  "id": "...",
  "refId": "...",
  "status": "PENDING_PAYMENT",
  "finalAmount": "450.00",
  "frequency": "MONTHLY",
  "paymentLink": "https://rzp.io/i/xxxxx",
  "quantity": 1,
  "addressId": "...",
  "productId": "...",
  "productVariantId": "..."
}
```

After payment, webhook activates subscription and creates the first order. Poll `GET /subscriptions/products/:id` until `status === "ACTIVE"` if needed.

---

### 3. List my subscriptions

```http
GET /api/v1/subscriptions/products
```

No query params. `data` is an **array**. Each item includes nested `product` and `variant` (and `user` is null on customer APIs).

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "refId": "UPS...",
      "status": "ACTIVE",
      "frequency": "MONTHLY",
      "finalAmount": "450.00",
      "product": {
        "id": "uuid",
        "refId": "PRD...",
        "name": "Contact Lens Pack",
        "slug": "contact-lens-pack",
        "status": "PUBLISHED"
      },
      "variant": {
        "id": "uuid",
        "productId": "uuid",
        "sku": "CL-001",
        "slug": "cl-001",
        "displayName": "Power -1.25",
        "sellingPrice": "500.00",
        "mrp": "599.00",
        "status": "ACTIVE"
      },
      "user": null
    }
  ],
  "message": "Subscriptions fetched successfully",
  "timestamp": "..."
}
```

---

### 4. Get subscription detail

```http
GET /api/v1/subscriptions/products/:id
```

| Path | Type | Required |
|------|------|----------|
| `id` | UUID | **Yes** |

Same object shape as one list item (includes `product` + `variant`).

---

### 5. List payments for a subscription

```http
GET /api/v1/subscriptions/products/:id/payments
```

| Path | Type | Required |
|------|------|----------|
| `id` | UUID | **Yes** |

Returns array of payment rows (`paymentLink`, `status`, `amount`, `billingCycleRef`, …) plus nested `product`, `variant`, and `subscription` summary for UI.

---

### 6. Pause

```http
POST /api/v1/subscriptions/products/:id/pause
Content-Type: application/json
```

| Field | Type | Required |
|-------|------|----------|
| `reason` | string ≤ 500 | No |

```json
{
  "reason": "Going on vacation"
}
```

Body may be `{}` or omitted fields only.

---

### 7. Resume

```http
POST /api/v1/subscriptions/products/:id/resume
```

No body.

---

### 8. Cancel

```http
POST /api/v1/subscriptions/products/:id/cancel
Content-Type: application/json
```

| Field | Type | Required |
|-------|------|----------|
| `reason` | string ≤ 500 | No |

```json
{
  "reason": "No longer needed"
}
```

---

### 9. Skip next delivery

```http
POST /api/v1/subscriptions/products/:id/skip-next
```

No body. Advances next billing/delivery date by one frequency cycle (when config allows skip).

---

### 10. Change frequency

```http
PATCH /api/v1/subscriptions/products/:id/frequency
Content-Type: application/json
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `frequency` | enum | **Yes** | Must be allowed by config; applies from next cycle |

```json
{
  "frequency": "QUARTERLY"
}
```

---

### 11. Update address

```http
PATCH /api/v1/subscriptions/products/:id/address
Content-Type: application/json
```

| Field | Type | Required |
|-------|------|----------|
| `addressId` | UUID | **Yes** |

```json
{
  "addressId": "33333333-3333-3333-3333-333333333333"
}
```

---

### 12. Retry renewal / pending payment

```http
POST /api/v1/subscriptions/products/:id/retry-payment
```

No body. Returns subscription with a new `paymentLink`.

---

## Memberships

### 1. List active plans

```http
GET /api/v1/memberships/plans
```

No query. Returns active plans (often with `benefits`).

---

### 2. Get plan detail

```http
GET /api/v1/memberships/plans/:idOrRefId
```

| Path | Type | Required | Notes |
|------|------|----------|--------|
| `idOrRefId` | UUID or refId | **Yes** | Either works |

---

### 3. Purchase membership (returns payment link)

```http
POST /api/v1/memberships/purchase
Content-Type: application/json
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `planRefId` | string | **One of** `planRefId` / `planId` | Prefer for storefront |
| `planId` | UUID | **One of** `planRefId` / `planId` | |
| `termsAccepted` | boolean | No | |

```json
{
  "planRefId": "MPLAN001",
  "termsAccepted": true
}
```

or

```json
{
  "planId": "44444444-4444-4444-4444-444444444444",
  "termsAccepted": true
}
```

**`data`** includes `paymentLink` and membership with `status: "PENDING_PAYMENT"`.

Membership payment success does **not** create a product order.

---

### 4. Current membership

```http
GET /api/v1/memberships/me
```

No query. Active / in-grace membership, or `null`. Includes nested `plan` (with `benefits`).

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "refId": "UME...",
    "status": "ACTIVE",
    "membershipPlanId": "uuid",
    "startDate": "...",
    "endDate": "...",
    "nextBillingDate": "...",
    "plan": {
      "id": "uuid",
      "refId": "MPL...",
      "name": "Gold",
      "price": "999.00",
      "billingCycle": "YEARLY",
      "benefits": []
    },
    "user": null
  },
  "message": "...",
  "timestamp": "..."
}
```

---

### 5. Membership history

```http
GET /api/v1/memberships/history
```

`data` is an **array** of memberships (all statuses). Each item includes nested `plan`.

---

### 6. My membership payments

```http
GET /api/v1/memberships/payments
```

`data` is an **array**. Each payment includes nested `plan` for display.

---

### 7. Cancel membership

```http
POST /api/v1/memberships/cancel
Content-Type: application/json
```

| Field | Type | Required |
|-------|------|----------|
| `reason` | string ≤ 500 | No |

```json
{
  "reason": "Switching plans later"
}
```

---

### 8. Renew membership

```http
POST /api/v1/memberships/renew
```

No body. Returns `paymentLink` when renewal is allowed.

---

### 9. Change plan (upgrade / downgrade)

```http
POST /api/v1/memberships/change-plan
Content-Type: application/json
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `planRefId` | string | **One of** | |
| `planId` | UUID | **One of** | |

```json
{
  "planRefId": "MPLAN002"
}
```

Charges full new plan price (no proration). Returns `paymentLink`.

---

## UX checklist

| Screen | Call |
|--------|------|
| PDP Subscribe & Save | `GET .../config` then `POST .../subscriptions/products` |
| Pay | Open `paymentLink` |
| My Account → Subscriptions | `GET .../subscriptions/products` |
| Subscription detail / actions | pause / resume / cancel / skip / frequency / address / retry |
| Membership plans | `GET .../memberships/plans` |
| Buy membership | `POST .../memberships/purchase` |
| My membership | `GET .../memberships/me` |
