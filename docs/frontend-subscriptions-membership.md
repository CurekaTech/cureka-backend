# Frontend — Product Subscriptions & Memberships (Website)

## Overview

Two storefront domains:

1. **Product subscriptions** — recurring product purchases via payment link
2. **Memberships** — paid membership plans with benefits (no order on payment)

Auth: session cookie + verified user (`SessionCookieGuard` + `VerifiedUserGuard`).

---

## Product subscriptions

### UX → fields → API

| UX step | Fields | API |
|--------|--------|-----|
| PDP / config | `productId`, optional `productVariantId` | `GET /subscriptions/products/config?productId=&productVariantId=` |
| Subscribe | `productId`, `productVariantId`, `quantity`, `frequency`, `addressId`, `termsAccepted?` | `POST /subscriptions/products` → returns subscription + `paymentLink` |
| My list | — | `GET /subscriptions/products` |
| Detail | `id` | `GET /subscriptions/products/:id` |
| Payments | `id` | `GET /subscriptions/products/:id/payments` |
| Pause | `reason?` | `POST /subscriptions/products/:id/pause` |
| Resume | — | `POST /subscriptions/products/:id/resume` |
| Cancel | `reason?` | `POST /subscriptions/products/:id/cancel` |
| Skip next | — | `POST /subscriptions/products/:id/skip-next` |
| Change frequency | `frequency` | `PATCH /subscriptions/products/:id/frequency` |
| Update address | `addressId` | `PATCH /subscriptions/products/:id/address` |
| Retry payment | — | `POST /subscriptions/products/:id/retry-payment` → new `paymentLink` |

**Frequencies:** `MONTHLY` \| `BI_MONTHLY` \| `QUARTERLY` (must be allowed by product config).

**Pricing:** never send amounts from FE. Backend calculates from variant `sellingPrice` + config discount + active membership discount.

**Payment:** open returned `paymentLink`. Webhook activates subscription and creates the first/renewal **order**.

---

## Memberships

| UX step | Fields | API |
|--------|--------|-----|
| Plan list | — | `GET /memberships/plans` |
| Plan detail | `id` or `refId` | `GET /memberships/plans/:idOrRefId` |
| Purchase | `planRefId` or `planId`, `termsAccepted?` | `POST /memberships/purchase` → `paymentLink` |
| My membership | — | `GET /memberships/me` |
| History | — | `GET /memberships/history` |
| Payments | — | `GET /memberships/payments` |
| Cancel | `reason?` | `POST /memberships/cancel` |
| Renew | — | `POST /memberships/renew` |
| Change plan | `planRefId` or `planId` | `POST /memberships/change-plan` |

**Important:** membership payment success does **not** create an order. Benefits (`FREE_SHIPPING`, `MEMBER_DISCOUNT`) apply when active.

---

## Statuses (product subscription)

`PENDING_PAYMENT` → `ACTIVE` → `RENEWAL_PAYMENT_PENDING` / `PAST_DUE` → `PAUSED` / `CANCELLED` / `EXPIRED`

## Statuses (membership)

Same lifecycle shape; one ACTIVE (or grace) membership per user.
