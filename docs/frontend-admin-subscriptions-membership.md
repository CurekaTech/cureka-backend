# Frontend Admin — Subscriptions & Membership

## Sidebar menu

Server-driven from `GET /auth/admin/menu` (`MENU_HIERARCHY`).

| Menu name | key | href | requiredPermissions |
|-----------|-----|------|---------------------|
| **Subscription & Membership** (parent) | `subscriptions` | — | — |
| Membership Plans | `subscriptions-membership-plans` | `/memberships/plans` | `membership_plans.read` |
| User Memberships | `subscriptions-user-memberships` | `/memberships/users` | `user_memberships.read` |
| Membership Payments | `subscriptions-membership-payments` | `/memberships/payments` | `membership_payments.read` |
| Product Subscriptions | `subscriptions-product-subscriptions` | `/subscriptions/products` | `user_product_subscriptions.read` |
| Subscription Payments | `subscriptions-product-payments` | `/subscriptions/payments` | `subscription_payments.read` |
| Failed Renewals | `subscriptions-failed-renewals` | `/subscriptions/payments?status=FAILED` | `subscription_payments.read` |

**Product subscription settings** live on Product create/edit (`subscriptionEnabled` + nested `subscriptionConfig`) — not a separate sidebar item. Masters → Subscription Frequency remains master data only.

---

## Product CRUD — subscription config

When `subscriptionEnabled = true`, show nested `subscriptionConfig`:

| Field | Notes |
|-------|--------|
| `productVariantId` | Optional UUID; null = product-level |
| `enabled` | Config toggle |
| `frequencies` | `MONTHLY` \| `BI_MONTHLY` \| `QUARTERLY` |
| `discountType` / `discountValue` | `PERCENTAGE` \| `FLAT` |
| `minDurationMonths` / `maxDurationMonths` | Optional |
| `pauseAllowed`, `frequencyChangeAllowed`, `cancellationAllowed`, `skipAllowed` | Booleans |
| `gracePeriodDays`, `missedPaymentAction` | `PAUSE` \| `EXPIRE` |
| `renewalMethod` | Default `PAYMENT_LINK` |
| `reminderOffsetsJson` | Default `[7,2,0]` |

Admin product GET returns `subscriptionConfig` for form hydrate.

| Action | API |
|--------|-----|
| Create product (+ config) | `POST /products` with `subscriptionEnabled` + `subscriptionConfig` |
| Update product (+ config) | `PATCH /products/:refId` same nested fields |
| Get product (hydrate form) | `GET /products/:refId` → includes `subscriptionConfig` |

---

## Membership plans admin

| Action | API |
|--------|-----|
| Create plan | `POST /admin/memberships/plans` |
| List plans | `GET /admin/memberships/plans` |
| Get / update / delete | `GET|PATCH|DELETE /admin/memberships/plans/:id` |
| List / add benefits | `GET|POST /admin/memberships/plans/:id/benefits` |
| Update / delete benefit | `PATCH|DELETE /admin/memberships/plans/benefits/:benefitId` |

Benefit types: `FREE_SHIPPING`, `MEMBER_DISCOUNT`, `EARLY_ACCESS`, `PRIORITY_ACCESS`, `CONSULTATION_OFFER`.

---

## Monitoring APIs

| Screen | API | Permission |
|--------|-----|------------|
| User memberships | `GET /admin/memberships` | `user_memberships.read` |
| Membership payments | `GET /admin/memberships/payments` | `membership_payments.read` |
| Product subscriptions | `GET /admin/subscriptions/products` | `user_product_subscriptions.read` |
| Subscription payments | `GET /admin/subscriptions/products/payments` | `subscription_payments.read` |
| Subscription detail | `GET /admin/subscriptions/products/:id` | `user_product_subscriptions.read` |

All list endpoints support pagination (`page`, `limit`, `search`) plus optional `status` / `userId` filters.
