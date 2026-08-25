# GoKwik changes summary

**Date:** 2026-08-25  
**Priority:** P0 — stop exposing long-lived `user_session` to browser / GoKwik SDK  
**Status:** Implemented, build + `npm run dev` verified

---

## Why

Previously, checkout/modal put the **same long-lived HttpOnly `user_session` value** into `paymentData.customerToken`. The storefront (or a Next.js bridge) could then pass that to the GoKwik SDK as Bearer auth.

That defeated HttpOnly: XSS could steal a ~90-day login session and call any storefront API.

---

## What we changed

### 1. Short-lived opaque `customerToken` (not JWT)

On GoKwik checkout:

- `POST /api/v1/payment-requests/checkout`
- `POST /api/v1/payment-requests/checkout/modal`

Backend **always mints a new opaque token** (same style as session tokens: 64-char hex) and returns it as:

```json
{
  "gateway": "gokwik",
  "checkoutProvider": "gokwik",
  "paymentData": {
    "merchantCheckoutId": "<cart uuid>",
    "customerToken": "<SHORT_LIVED_OPAQUE_TOKEN>",
    "...": "unchanged shape"
  }
}
```

Rules:

| Rule | Detail |
| --- | --- |
| Not equal to `user_session` | New random token every mint |
| TTL | Default **45 minutes** (`GOKWIK_CHECKOUT_TOKEN_TTL_SECONDS`, default `2700`) |
| Bound to | `userId` + `cartId` (`deviceId = gokwik:<cartId>`) |
| Storage | `user_sessions` row with `purpose = gokwik_checkout` |
| FE must not pass session in body | Mint happens server-side after cookie auth |

### 2. DB migration — `user_sessions.purpose`

**File:** `apps/api/database/migrations/1785964000000-add-user-session-purpose.ts`

```text
purpose varchar(32) NOT NULL DEFAULT 'login'
```

| `purpose` | Meaning |
| --- | --- |
| `login` | Long-lived HttpOnly storefront session |
| `gokwik_checkout` | Short-lived GoKwik SDK `customerToken` |

**Deploy note:** run this migration before/with the release.

### 3. GoKwik merchant callback auth

**Guard:** `GokwikCheckoutAuthGuard` (replaces `SessionCookieGuard` on cart/order callbacks)

Applied on:

- `/api/v1/gokwik/get-cart`
- `/api/v1/gokwik/create-order`
- `/api/v1/gokwik/place-order`
- `/api/v1/gokwik/set-shipping-address`
- discount / OOS / check-order-exists routes under the same controllers

| Token | `/gokwik/*` | Normal APIs (`/auth/me`, cart, orders, profile…) |
| --- | --- | --- |
| Short-lived `gokwik_checkout` Bearer | Yes | **No** — `SessionCookieGuard` rejects |
| Long-lived `user_session` | Fallback during rollout | Yes |
| Expired / revoked | 401 | 401 |

Cart binding: if token is `gokwik_checkout`, body `cart_id` / `session_key` must match the cart embedded in the token.

### 4. Deprecated safe bridge (optional)

```http
POST /api/v1/payment-requests/checkout/gokwik-customer-token
```

- Auth: HttpOnly `user_session` (normal `SessionCookieGuard`)
- Returns **only** a newly minted short-lived opaque token
- **Never** returns `user_session`
- Prefer `paymentData.customerToken` from checkout/modal

Frontend should remove Next.js `GET /api/checkout/gokwik-customer-token` (session echo) after this ships.

### 5. Idempotency-Key

Honored on:

- `POST /payment-requests/checkout`
- `POST /payment-requests/checkout/modal`
- `POST /payment-requests/checkout/modal/verify`

Same `Idempotency-Key` + user → cached JSON response for **24h** (Redis / in-memory via `CacheService`).

### 6. Cookie flags (confirmed, unchanged)

| Flag | Value |
| --- | --- |
| HttpOnly | `true` |
| SameSite | `Lax` |
| Secure | `COOKIE_SECURE` or HTTPS via `X-Forwarded-Proto` |
| Path | `/` |

---

## Architecture (after)

```text
Login
  → HttpOnly user_session (purpose=login, long-lived)
  → never returned as customerToken

POST /payment-requests/checkout[/modal]
  → SessionCookieGuard (cookie)
  → mint opaque gokwik_checkout token (TTL ~45m)
  → paymentData.customerToken

GoKwik SDK
  → Authorization: Bearer <customerToken>

POST /gokwik/*
  → GokwikCheckoutAuthGuard
  → VerifiedUserGuard
  → GokwikCartOwnerGuard (+ cart binding)
```

---

## Files touched (main)

### Auth / session

| File | Change |
| --- | --- |
| `modules/auth/entities/user-session.entity.ts` | Added `purpose` |
| `modules/auth/constants/session-purpose.constants.ts` | `login` / `gokwik_checkout` helpers |
| `modules/auth/services/session.service.ts` | Create/resolve with purpose; hide gokwik rows from session list |
| `modules/auth/guards/session-cookie.guard.ts` | Reject `gokwik_checkout` on normal APIs |
| `modules/auth/guards/optional-session-cookie.guard.ts` | Ignore gokwik tokens |
| `modules/auth/services/gokwik-checkout-token.service.ts` | **Mint / resolve / revoke** opaque tokens (lives in AuthModule to avoid circular imports) |
| `modules/auth/auth.module.ts` | Registers + exports `GokwikCheckoutTokenService` |

### GoKwik

| File | Change |
| --- | --- |
| `modules/gokwik/guards/gokwik-checkout-auth.guard.ts` | Bearer auth for merchant callbacks |
| `modules/gokwik/guards/gokwik-cart-owner.guard.ts` | Enforce cart binding from token |
| `modules/gokwik/controllers/gokwik-cart.controller.ts` | Uses `GokwikCheckoutAuthGuard` |
| `modules/gokwik/controllers/gokwik-order.controller.ts` | Uses `GokwikCheckoutAuthGuard` |
| `modules/gokwik/gokwik.module.ts` | Guard wiring; `forwardRef(OrdersModule)` |

### Payment / checkout

| File | Change |
| --- | --- |
| `modules/payment-requests/services/payment-requests.service.ts` | Mint token inside `createGokwikCheckoutSession`; stop echoing session |
| `modules/payment-requests/controllers/customer-payment-requests.controller.ts` | No session echo; Idempotency-Key; deprecated mint endpoint |
| `modules/payment-requests/services/checkout-idempotency.service.ts` | Idempotency helper |
| `modules/payment-requests/payment-requests.module.ts` | No direct `GokwikModule` import (breaks circular dependency) |

### Config / docs / migration

| File | Change |
| --- | --- |
| `apps/api/config/gokwik.config.ts` | `checkoutTokenTtlSeconds` |
| `apps/api/config/env.validation.ts` | Optional TTL / secret env |
| `.env.example` | Documented TTL env |
| `apps/api/database/migrations/1785964000000-add-user-session-purpose.ts` | `purpose` column |
| `docs/gokwik-checkout-token-security.md` | Full security analysis + ticket notes |

---

## Circular dependency fix (boot crash)

`PaymentRequestsModule` importing `GokwikModule` caused:

```text
Nest cannot create the GokwikModule instance.
The module at index [1] of the GokwikModule "imports" array is undefined.
```

**Fix:** keep `GokwikCheckoutTokenService` in global `AuthModule`; payment-requests no longer imports `GokwikModule`.

---

## Env

```bash
# Optional — default 2700 (45 minutes)
GOKWIK_CHECKOUT_TOKEN_TTL_SECONDS=2700
```

---

## Frontend contract (after deploy)

1. Use **only** `paymentData.customerToken` from checkout/modal for GoKwik SDK  
2. Remove Next.js bridge that returned raw `user_session`  
3. Fail closed if `customerToken` is missing  
4. Keep sending `Idempotency-Key` on checkout / verify (now honored)

---

## Acceptance checklist

- [ ] Checkout/modal returns `customerToken` ≠ `user_session` cookie  
- [ ] `Authorization: Bearer <customerToken>` works on `/gokwik/get-cart` while unexpired  
- [ ] After TTL → 401  
- [ ] Same token on `/auth/me` (or profile) → 401  
- [ ] Browser still uses HttpOnly `user_session` for normal storefront  
- [ ] Migration `AddUserSessionPurpose1785964000000` applied  

---

## Suggested commit message

```text
fix(gokwik): mint short-lived customerToken instead of echoing user_session

Stop returning the long-lived storefront session to the browser for GoKwik SDK.
Issue a checkout-scoped opaque Bearer token with short TTL for merchant callbacks.
```

---

## One-line standup

> GoKwik ke liye long-lived `user_session` browser JSON me mat bhejo; short-lived scoped `customerToken` mint karo jo sirf GoKwik merchant callbacks pe Bearer ke through kaam kare.
