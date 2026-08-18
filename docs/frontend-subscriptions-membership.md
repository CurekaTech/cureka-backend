# Frontend — Product Subscriptions & Memberships (Website)

**Base URL:** `/api/v1`  
**Auth:** session cookie (`Credentials: include`) + verified user (`SessionCookieGuard` + `VerifiedUserGuard`)  
**Response envelope:** `{ success, data, message, timestamp }`

Two storefront domains:

1. **Product subscriptions** — first purchase is **cart → checkout → pay → order**. Backend then creates an **ACTIVE** subscription. Renewals stay on the subscription payment path (payment link today; AutoPay later).
2. **Memberships** — paid plans with benefits. **Not** in cart. Purchase uses `POST /memberships/purchase`.

**Do not send prices from the frontend.** Backend calculates amounts.

### Nested objects on GET responses

| Domain | Nested fields |
|--------|----------------|
| Product subscription GET/list | `product`, `variant`, `user` |
| Product subscription payments | `product`, `variant`, `user`, `subscription` |
| PDP config GET | `product`, `variant` (when `productVariantId` sent) |
| Membership GET `/me`, `/history` | `plan` (+ `benefits`), `user` |
| Membership payments | `plan`, `user` |

**`user`**
```json
{
  "id": "uuid",
  "refId": "USR...",
  "firstName": "Asha",
  "lastName": "Patel",
  "email": "asha@example.com",
  "mobileNumber": "9876543210"
}
```

**`product`**
```json
{
  "id": "uuid",
  "refId": "PRD...",
  "name": "Contact Lens Pack",
  "slug": "contact-lens-pack",
  "status": "PUBLISHED",
  "imageUrl": "https://...",
  "thumbnailUrl": "https://..."
}
```

**`variant`**
```json
{
  "id": "uuid",
  "productId": "uuid",
  "sku": "CL-001",
  "slug": "cl-001",
  "displayName": "Power -1.25",
  "sellingPrice": "500.00",
  "mrp": "599.00",
  "status": "ACTIVE"
}
```

**`plan`** — full plan + `benefits[]` (see membership section). `FREE_SHIPPING` includes `minOrderValue`.

---

## Product subscription — cart-first (required)

### Flow

1. PDP: `GET .../config` → user picks frequency + qty → **Add to cart** as a subscription line.
2. Cart / checkout show the line as a subscription (`lineType`, `frequency`, subscription price).
3. Pay with existing checkout. Mixed cart is allowed (one-time + subscription lines together).
4. After payment: one **order** is created. Backend creates an **ACTIVE** subscription per subscribed line (no second charge).
5. List with `GET /subscriptions/products`.

**Do not call `POST /subscriptions/products` for first purchase.** It returns `400`.

---

### 1. PDP config

```http
GET /api/v1/subscriptions/products/config?productId={uuid}&productVariantId={uuid}
```

| Query | Type | Required | Notes |
|-------|------|----------|--------|
| `productId` | UUID | **Yes** | |
| `productVariantId` | UUID | No | Prefer variant-specific config; falls back to product-level |

No body. `data` is the config object, or `null` if subscription is not enabled.

`data` includes `frequencies[]` for the PDP selector, plus nested `product` and `variant` (variant is `null` if `productVariantId` omitted).

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "productId": "uuid",
    "productVariantId": "uuid",
    "enabled": true,
    "frequencies": ["MONTHLY", "QUARTERLY"],
    "discountType": "PERCENTAGE",
    "discountValue": "10.00",
    "pauseAllowed": true,
    "frequencyChangeAllowed": true,
    "cancellationAllowed": true,
    "skipAllowed": true,
    "product": { "id": "uuid", "name": "Contact Lens Pack", "slug": "...", "imageUrl": "https://..." },
    "variant": { "id": "uuid", "sku": "CL-001", "displayName": "Power -1.25", "sellingPrice": "500.00" }
  }
}
```

---

### 2. Add item to cart

```http
POST /api/v1/cart/items
```

No query params.

**One-time product**

```json
{
  "productId": "uuid",
  "variantId": "uuid",
  "quantity": 1
}
```

**Subscribe & Save**

```json
{
  "productId": "uuid",
  "variantId": "uuid",
  "quantity": 1,
  "isSubscription": true,
  "frequency": "MONTHLY"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `productId` | UUID | **Yes** | |
| `variantId` | UUID | **Yes** | Cart field name is `variantId` (not `productVariantId`) |
| `quantity` | int ≥ 1 | **Yes** | |
| `isSubscription` | boolean | No | default `false` |
| `frequency` | `MONTHLY` \| `BI_MONTHLY` \| `QUARTERLY` | **Yes if `isSubscription`** | Must be allowed on product config |

Same SKU can exist twice: buy-once line and subscribe line.

---

### 3. Get cart

```http
GET /api/v1/cart?paymentMethod=RAZORPAY
```

| Query | Type | Required | Notes |
|-------|------|----------|--------|
| `paymentMethod` | enum | No | Preview COD charge / prepaid discount. `COD` \| `WALLET` \| `RAZORPAY` \| `CASHFREE` \| `GOKWIK_PREPAID` \| `GOKWIK_PARTIAL_COD` |

No body. Each line includes:

| Field | Example | UI |
|-------|---------|-----|
| `isSubscription` | `true` | |
| `frequency` | `"MONTHLY"` | |
| `lineType` | `"SUBSCRIPTION"` \| `"ONE_TIME"` | Badge: **Subscribe & Save · Monthly** |
| `unitPrice` / `totalPrice` | subscription price when subscribed | Do not re-price on FE |

---

### 4. Validate checkout

```http
POST /api/v1/orders/checkout
```

No query params.

```json
{
  "addressId": "uuid",
  "paymentMethod": "RAZORPAY",
  "orderSource": "WEBSITE"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `addressId` | UUID | Usually yes | Optional only for GoKwik address-less start |
| `paymentMethod` | enum | No | Affects fee lines only (COD / prepaid). Does not open a gateway |
| `orderSource` | `WEBSITE` \| `APP` | No | default `WEBSITE` |

---

### 5. Start payment (prepaid)

```http
POST /api/v1/payment-requests/checkout
POST /api/v1/payment-requests/checkout/modal
```

No query params. Same body:

```json
{
  "addressId": "uuid",
  "paymentMethod": "RAZORPAY",
  "orderSource": "WEBSITE"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `addressId` | UUID | Usually yes | Optional for GoKwik; required for Razorpay / Cashfree / Shiprocket |
| `paymentMethod` | enum | No | Prepaid % for `RAZORPAY` / `CASHFREE` |
| `orderSource` | `WEBSITE` \| `APP` | No | |

After Razorpay/Cashfree modal:

```http
POST /api/v1/payment-requests/checkout/modal/verify
```

```json
{
  "razorpay_order_id": "...",
  "razorpay_payment_id": "...",
  "razorpay_signature": "..."
}
```

Cashfree: `cf_order_id`, `cf_payment_id`. Shiprocket: `shiprocket_session_id`, `shiprocket_order_id`, `shiprocket_payment_id`.

---

### 6. Place COD / wallet order

```http
POST /api/v1/orders
```

No query params. **Do not** use this for Razorpay / Cashfree / GoKwik.

```json
{
  "addressId": "uuid",
  "paymentMethod": "COD",
  "orderSource": "WEBSITE",
  "notes": null
}
```

| Field | Type | Required |
|-------|------|----------|
| `addressId` | UUID | **Yes** |
| `paymentMethod` | `COD` \| `WALLET` | **Yes** |
| `orderSource` | `WEBSITE` \| `APP` | No |
| `notes` | string ≤ 1000 | No |

---

### 7. After payment

- Order items include `isSubscription`, `frequency`, `subscriptionId` (filled after activation).
- Subscription is created server-side as `ACTIVE`. If the list is empty right after verify, poll `GET /subscriptions/products`.

**Do not** call `POST /subscriptions/products/from-paid-order` on the happy path.

---

## Manage product subscriptions

All paths below: **path `id` = subscription UUID**. No query params unless noted. Responses include `product`, `variant`, and `user`.

### List mine

```http
GET /api/v1/subscriptions/products
```

No query. `data` is an **array**.

### Get one

```http
GET /api/v1/subscriptions/products/:id
```

| Path | Type | Required |
|------|------|----------|
| `id` | UUID | **Yes** |

Same object as one list item (`product` + `variant` + `user`).

### List payments

```http
GET /api/v1/subscriptions/products/:id/payments
```

| Path | Type | Required |
|------|------|----------|
| `id` | UUID | **Yes** |

`data` is an **array**. Each row includes `product`, `variant`, `user`, and `subscription` summary.

### Pause

```http
POST /api/v1/subscriptions/products/:id/pause
```

```json
{
  "reason": "Going on vacation"
}
```

| Field | Type | Required |
|-------|------|----------|
| `reason` | string ≤ 500 | No |

### Resume

```http
POST /api/v1/subscriptions/products/:id/resume
```

No body.

### Cancel

```http
POST /api/v1/subscriptions/products/:id/cancel
```

```json
{
  "reason": "No longer needed"
}
```

| Field | Type | Required |
|-------|------|----------|
| `reason` | string ≤ 500 | No |

### Skip next cycle

```http
POST /api/v1/subscriptions/products/:id/skip-next
```

No body.

### Change frequency

```http
PATCH /api/v1/subscriptions/products/:id/frequency
```

```json
{
  "frequency": "QUARTERLY"
}
```

| Field | Type | Required |
|-------|------|----------|
| `frequency` | `MONTHLY` \| `BI_MONTHLY` \| `QUARTERLY` | **Yes** |

### Change address

```http
PATCH /api/v1/subscriptions/products/:id/address
```

```json
{
  "addressId": "uuid"
}
```

| Field | Type | Required |
|-------|------|----------|
| `addressId` | UUID | **Yes** | User’s saved address |

### Retry renewal payment

```http
POST /api/v1/subscriptions/products/:id/retry-payment
```

No body. Returns checkout extras (`paymentLink` / Razorpay order / Cashfree session) when a cycle is pending. **Not used for first purchase.**

---

## Memberships (not cart)

### List active plans

```http
GET /api/v1/memberships/plans
```

No query. `data` is an **array** of plans with `benefits[]`.

### Get plan

```http
GET /api/v1/memberships/plans/:idOrRefId
```

| Path | Type | Required |
|------|------|----------|
| `idOrRefId` | UUID **or** `refId` (e.g. `MPL2026851144`) | **Yes** |

### Purchase

```http
POST /api/v1/memberships/purchase
```

```json
{
  "planRefId": "MPL2026851144",
  "termsAccepted": true
}
```

or

```json
{
  "planId": "uuid",
  "termsAccepted": true
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `planRefId` | string | **One of** `planRefId` / `planId` | Prefer for storefront |
| `planId` | UUID | **One of** | |
| `termsAccepted` | boolean | No | default `true` |

`data` includes `paymentLink` (and Razorpay/Cashfree extras). Status is `PENDING_PAYMENT` until webhook. Membership payment does **not** create a product order.

### Current membership

```http
GET /api/v1/memberships/me
```

No query. Active / in-grace membership, or `null`. Includes `plan` (+ `benefits`) and `user`.

### History

```http
GET /api/v1/memberships/history
```

No query. `data` is an **array**. Each item includes `plan` and `user`.

### Payments

```http
GET /api/v1/memberships/payments
```

No query. `data` is an **array**. Each item includes `plan` and `user`.

### Cancel

```http
POST /api/v1/memberships/cancel
```

```json
{
  "reason": "Switching plans later"
}
```

| Field | Type | Required |
|-------|------|----------|
| `reason` | string ≤ 500 | No |

### Renew

```http
POST /api/v1/memberships/renew
```

No body. Returns `paymentLink` when renewal is allowed.

### Change plan

```http
POST /api/v1/memberships/change-plan
```

```json
{
  "planRefId": "MPL2026194794"
}
```

| Field | Type | Required |
|-------|------|----------|
| `planRefId` | string | **One of** `planRefId` / `planId` |
| `planId` | UUID | **One of** |

Charges full new plan price (no proration). Returns `paymentLink`.

---

## UX checklist

| Screen | Call |
|--------|------|
| PDP Subscribe & Save | `GET .../config` then `POST /cart/items` with `isSubscription` + `frequency` |
| Cart | `GET /cart` — badge from `lineType` / `frequency` |
| Pay | `POST /orders/checkout` then `POST /payment-requests/checkout` (or `/modal`) |
| My Account → Subscriptions | `GET .../subscriptions/products` (`product` + `variant` + `user`) |
| Subscription actions | pause / resume / cancel / skip / frequency / address / retry |
| Membership plans | `GET .../memberships/plans` |
| Buy membership | `POST .../memberships/purchase` |
| My membership | `GET .../memberships/me` (`plan` + `user`) |
