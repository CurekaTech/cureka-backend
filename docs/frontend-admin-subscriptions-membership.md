# Frontend Admin — Subscriptions & Membership

**Base URL:** `/api/v1`  
**Auth:** Admin JWT (`Authorization: Bearer <token>` and/or `admin_token` cookie)  
**Guards:** `JwtAuthGuard` + `RolesGuard` + `PermissionsGuard`  
**Response envelope:** `{ success, data, message, timestamp }`

Admin panel proxy (if used): strip `/admin/api/proxy/` and forward to `/api/v1/...` — same as other admin docs.

---

## Sidebar menu

Server-driven from `GET /api/v1/auth/admin/menu` (`MENU_HIERARCHY`).

| Menu name | key | href (FE route) | requiredPermissions |
|-----------|-----|-----------------|---------------------|
| **Subscription & Membership** (parent) | `subscriptions` | — | — |
| Membership Plans | `subscriptions-membership-plans` | `/memberships/plans` | `membership_plans.read` |
| User Memberships | `subscriptions-user-memberships` | `/memberships/users` | `user_memberships.read` |
| Membership Payments | `subscriptions-membership-payments` | `/memberships/payments` | `membership_payments.read` |
| Product Subscriptions | `subscriptions-product-subscriptions` | `/subscriptions/products` | `user_product_subscriptions.read` |
| Subscription Payments | `subscriptions-product-payments` | `/subscriptions/payments` | `subscription_payments.read` |
| Failed Renewals | `subscriptions-failed-renewals` | `/subscriptions/payments?status=FAILED` | `subscription_payments.read` |

**Product subscription settings** are configured on **Product create/edit** (`subscriptionEnabled` + nested `subscriptionConfig`) — not a separate sidebar item.

Masters → **Subscription Frequency** is unrelated master data.

---

## Shared pagination query (admin lists)

All list endpoints below accept:

| Query | Type | Required | Default | Notes |
|-------|------|----------|---------|--------|
| `page` | int ≥ 1 | No | `1` | |
| `limit` | int 1–100 | No | `20` | |
| `search` | string ≤ 100 | No | — | When supported by endpoint |
| `sortBy` | string | No | — | When supported |
| `sortOrder` | `ASC` \| `DESC` | No | — | When supported |

---

## Product CRUD — subscription config

When creating/updating a product, if subscription is enabled, send nested `subscriptionConfig`.

### Product fields

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `subscriptionEnabled` | boolean | No | Set `true` to enable Subscribe & Save |
| `subscriptionConfig` | object | **Required when `subscriptionEnabled === true`** | Nested object below |

### `subscriptionConfig` fields

| Field | Type | Required | Default / notes |
|-------|------|----------|-----------------|
| `productVariantId` | UUID \| null | No | Omit / `null` = all variants of product |
| `enabled` | boolean | **Yes** | Config on/off |
| `frequencies` | enum[] | **Yes** | Min 1 item: `MONTHLY` \| `BI_MONTHLY` \| `QUARTERLY` |
| `discountType` | enum | **Yes** | `PERCENTAGE` \| `FLAT` |
| `discountValue` | number ≥ 0 | **Yes** | e.g. `10` for 10% or flat ₹ |
| `minDurationMonths` | int ≥ 1 | No | |
| `maxDurationMonths` | int ≥ 1 | No | |
| `pauseAllowed` | boolean | No | default `true` |
| `frequencyChangeAllowed` | boolean | No | default `true` |
| `cancellationAllowed` | boolean | No | default `true` |
| `skipAllowed` | boolean | No | default `true` |
| `gracePeriodDays` | int ≥ 0 | No | default `7` |
| `missedPaymentAction` | enum | No | `PAUSE` \| `EXPIRE` |
| `renewalMethod` | enum | No | `PAYMENT_LINK` \| `AUTO_PAY` (use `PAYMENT_LINK`) |
| `reminderOffsetsJson` | number[] | No | default `[7, 2, 0]` (days before due) |

### Create / update product (excerpt)

```http
POST /api/v1/products
PATCH /api/v1/products/:refId
Content-Type: application/json
Authorization: Bearer <admin-jwt>
```

```json
{
  "name": "Contact Lens Pack",
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
    "reminderOffsetsJson": [7, 2, 0]
  }
}
```

| Action | API |
|--------|-----|
| Create product (+ config) | `POST /api/v1/products` |
| Update product (+ config) | `PATCH /api/v1/products/:refId` |
| Get product (hydrate form) | `GET /api/v1/products/:refId` → includes `subscriptionConfig` |

When `subscriptionEnabled` is `false`, omit `subscriptionConfig` or leave it unset; backend disables related config.

---

## Membership plans admin

**Permission prefix:** `membership_plans.*` / `membership_benefits.*`

### Enums

| Field | Values |
|-------|--------|
| `billingCycle` | `MONTHLY` \| `QUARTERLY` \| `YEARLY` |
| `status` (plan/benefit) | `ACTIVE` \| `INACTIVE` |
| `renewalMethod` | `PAYMENT_LINK` \| `AUTO_PAY` |
| `benefitType` | `FREE_SHIPPING` \| `MEMBER_DISCOUNT` \| `EARLY_ACCESS` \| `PRIORITY_ACCESS` \| `CONSULTATION_OFFER` |
| `valueType` | `PERCENTAGE` \| `FLAT` \| `NONE` |

---

### 1. Create plan

```http
POST /api/v1/admin/memberships/plans
Content-Type: application/json
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `name` | string ≤ 255 | **Yes** | |
| `description` | string \| null | No | |
| `price` | number ≥ 0 | **Yes** | |
| `currency` | string ≤ 5 | No | default `INR` |
| `billingCycle` | enum | **Yes** | |
| `validityDays` | int ≥ 1 | **Yes** | e.g. 30 / 90 / 365 |
| `renewalEnabled` | boolean | No | default `true` |
| `gracePeriodDays` | int ≥ 0 | No | default `7` |
| `status` | enum | No | default `ACTIVE` |
| `sortOrder` | int | No | default `0` |
| `renewalMethod` | enum | No | default `PAYMENT_LINK` |

```json
{
  "name": "Gold",
  "description": "Yearly Cureka Gold membership",
  "price": 999,
  "currency": "INR",
  "billingCycle": "YEARLY",
  "validityDays": 365,
  "renewalEnabled": true,
  "gracePeriodDays": 7,
  "status": "ACTIVE",
  "sortOrder": 1,
  "renewalMethod": "PAYMENT_LINK"
}
```

---

### 2. List plans

```http
GET /api/v1/admin/memberships/plans?page=1&limit=20&status=ACTIVE&search=Gold
```

| Query | Type | Required | Notes |
|-------|------|----------|--------|
| `page`, `limit`, `search`, `sortBy`, `sortOrder` | — | No | Shared pagination |
| `status` | `ACTIVE` \| `INACTIVE` | No | Filter |

---

### 3. Get / update / delete plan

```http
GET    /api/v1/admin/memberships/plans/:id
PATCH  /api/v1/admin/memberships/plans/:id
DELETE /api/v1/admin/memberships/plans/:id
```

| Path | Type | Required |
|------|------|----------|
| `id` | UUID | **Yes** |

**PATCH body:** any subset of create fields (all optional on update).

```json
{
  "price": 899,
  "status": "INACTIVE"
}
```

---

### 4. List benefits for a plan

```http
GET /api/v1/admin/memberships/plans/:id/benefits
```

No query. `:id` = plan UUID (**required**).

---

### 5. Add benefit

```http
POST /api/v1/admin/memberships/plans/:id/benefits
Content-Type: application/json
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `benefitType` | enum | **Yes** | |
| `valueType` | enum | **Yes** | Use `NONE` for flag benefits like `FREE_SHIPPING` |
| `value` | number ≥ 0 | No | For `MEMBER_DISCOUNT` |
| `metadata` | object | No | e.g. `{ "freeCount": 2 }` for consultations |
| `status` | enum | No | default `ACTIVE` |
| `sortOrder` | int | No | default `0` |

**Free shipping**

```json
{
  "benefitType": "FREE_SHIPPING",
  "valueType": "NONE",
  "value": null,
  "metadata": null,
  "status": "ACTIVE",
  "sortOrder": 0
}
```

**Member discount 10%**

```json
{
  "benefitType": "MEMBER_DISCOUNT",
  "valueType": "PERCENTAGE",
  "value": 10,
  "status": "ACTIVE",
  "sortOrder": 1
}
```

---

### 6. Update / delete benefit

```http
PATCH  /api/v1/admin/memberships/plans/benefits/:benefitId
DELETE /api/v1/admin/memberships/plans/benefits/:benefitId
```

| Path | Type | Required |
|------|------|----------|
| `benefitId` | UUID | **Yes** |

**PATCH body:** any subset of create-benefit fields.

---

## Monitoring — user memberships

```http
GET /api/v1/admin/memberships?page=1&limit=20&status=ACTIVE&userId={uuid}&search=
```

| Query | Type | Required | Notes |
|-------|------|----------|--------|
| `page`, `limit`, `search`, … | — | No | Shared pagination |
| `status` | membership status enum | No | `PENDING_PAYMENT` \| `ACTIVE` \| `RENEWAL_PAYMENT_PENDING` \| `PAST_DUE` \| `PAUSED` \| `CANCELLED` \| `EXPIRED` |
| `userId` | UUID | No | Filter one customer |

**Permission:** `user_memberships.read`  
**FE route:** `/memberships/users`

---

## Monitoring — membership payments

```http
GET /api/v1/admin/memberships/payments?page=1&limit=20&status=PAID&userId={uuid}&userMembershipId={uuid}
```

| Query | Type | Required | Notes |
|-------|------|----------|--------|
| `page`, `limit`, `search`, … | — | No | |
| `status` | payment status enum | No | `PENDING` \| `LINK_GENERATED` \| `PAID` \| `FAILED` \| `EXPIRED` \| `CANCELLED` |
| `userId` | UUID | No | |
| `userMembershipId` | UUID | No | |

**Permission:** `membership_payments.read`  
**FE route:** `/memberships/payments`

---

## Monitoring — product subscriptions

```http
GET /api/v1/admin/subscriptions/products?page=1&limit=20&status=ACTIVE&userId={uuid}&search=
```

| Query | Type | Required | Notes |
|-------|------|----------|--------|
| `page`, `limit`, `search`, … | — | No | |
| `status` | product subscription status | No | `PENDING_PAYMENT` \| `ACTIVE` \| `RENEWAL_PAYMENT_PENDING` \| `PAUSED` \| `PAST_DUE` \| `CANCELLED` \| `EXPIRED` |
| `userId` | UUID | No | |

**Permission:** `user_product_subscriptions.read`  
**FE route:** `/subscriptions/products`

---

### Get one product subscription

```http
GET /api/v1/admin/subscriptions/products/:id
```

| Path | Type | Required |
|------|------|----------|
| `id` | UUID | **Yes** |

---

## Monitoring — subscription payments / failed renewals

```http
GET /api/v1/admin/subscriptions/products/payments?page=1&limit=20&status=FAILED&subscriptionId={uuid}&userId={uuid}
```

| Query | Type | Required | Notes |
|-------|------|----------|--------|
| `page`, `limit`, `search`, … | — | No | |
| `status` | payment status | No | Use `FAILED` for Failed Renewals menu |
| `subscriptionId` | UUID | No | |
| `userId` | UUID | No | |

**Permission:** `subscription_payments.read`  
**FE routes:**  
- All payments → `/subscriptions/payments`  
- Failed → `/subscriptions/payments?status=FAILED`

---

## Screen → API map

| Admin screen | Method | Path |
|--------------|--------|------|
| Product create/edit (subscription section) | POST/PATCH/GET | `/api/v1/products` … |
| Membership Plans list | GET | `/api/v1/admin/memberships/plans` |
| Create plan | POST | `/api/v1/admin/memberships/plans` |
| Edit plan | PATCH | `/api/v1/admin/memberships/plans/:id` |
| Plan benefits | GET/POST | `/api/v1/admin/memberships/plans/:id/benefits` |
| Edit/delete benefit | PATCH/DELETE | `/api/v1/admin/memberships/plans/benefits/:benefitId` |
| User Memberships | GET | `/api/v1/admin/memberships` |
| Membership Payments | GET | `/api/v1/admin/memberships/payments` |
| Product Subscriptions | GET | `/api/v1/admin/subscriptions/products` |
| Subscription detail | GET | `/api/v1/admin/subscriptions/products/:id` |
| Subscription Payments | GET | `/api/v1/admin/subscriptions/products/payments` |
