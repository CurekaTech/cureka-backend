# GoKwik `customerToken` security fix

**Owner:** Backend / Auth / Payments  
**Priority:** P0 (session exposure)  
**Author note:** MD + implementation aligned for Mohd Moin / storefront handoff  
**Storefront:** Cureka FE already uses HttpOnly `user_session` + GoKwik checkout bridge  
**Scope:** Backend-owned. Frontend removes the session bridge after this ships.

---

## Problem

GoKwik merchant callbacks need:

```http
Authorization: Bearer <token>
```

Previously the storefront could not read HttpOnly `user_session`, so it:

1. Called a same-origin bridge (`GET /api/checkout/gokwik-customer-token` on Next.js)
2. Server read `user_session` and returned `{ customerToken: "<raw user_session>" }`
3. GoKwik SDK received that long-lived value

Also, `POST /payment-requests/checkout/modal` used to echo `getSessionTokenFromRequest` into `paymentData.customerToken`.

**Risk:** XSS / malicious script can steal a long-lived login session → account takeover. HttpOnly was effectively bypassed for GoKwik checkout.

---

## Current Flow (after fix)

```text
Login
↓
HttpOnly user_session (opaque, purpose=login, ~90d)
↓
POST /payment-requests/checkout[/modal]  [SessionCookieGuard]
↓
GokwikCheckoutTokenService.issue
  → opaque random token (same style as session)
  → user_sessions row: purpose=gokwik_checkout, TTL 30–45m, deviceId=gokwik:<cartId>
↓
paymentData.customerToken = <SHORT_LIVED opaque token>  ≠ user_session
↓
GoKwik SDK
↓
Authorization: Bearer <customerToken>
↓
GokwikCheckoutAuthGuard → VerifiedUserGuard → GokwikCartOwnerGuard
↓
/gokwik/* merchant APIs
```

| Token | `/gokwik/*` | Normal storefront APIs |
| --- | --- | --- |
| Long-lived `user_session` cookie | Optional fallback (rollout) | Yes |
| Short-lived `gokwik_checkout` Bearer | Yes | **No** (`SessionCookieGuard` rejects) |
| Expired / revoked | 401 | 401 |

---

## Security Issue (what we fixed)

| Location | Before | After |
| --- | --- | --- |
| `createGokwikCheckoutSession` | Echoed request session into `customerToken` | Mints new opaque `gokwik_checkout` token |
| FE bridge | Returned raw `user_session` | FE removes bridge after backend ships; backend also has safe `POST …/gokwik-customer-token` that mints scoped token only |

---

## Files / changes

```text
File: apps/api/database/migrations/1785964000000-add-user-session-purpose.ts
Current responsibility: schema
Required change: user_sessions.purpose column (login | gokwik_checkout)
Risk: low — default 'login' for existing rows
```

```text
File: modules/auth/entities/user-session.entity.ts (+ SessionService, SessionCookieGuard)
Current responsibility: opaque sessions
Required change: purpose on create/resolve; reject gokwik_checkout on normal APIs
Risk: medium — must run migration before deploy
```

```text
File: modules/gokwik/services/gokwik-checkout-token.service.ts
Current responsibility: mint/resolve customerToken
Required change: opaque hashed row (not JWT)
Risk: low
```

```text
File: modules/gokwik/guards/gokwik-checkout-auth.guard.ts
Current responsibility: GoKwik merchant auth
Required change: resolve gokwik_checkout first; login fallback for legacy
Risk: low
```

```text
File: modules/payment-requests/services/payment-requests.service.ts
Current responsibility: checkout payload
Required change: always mint short-lived customerToken for GoKwik
Risk: low — response shape unchanged
```

```text
File: modules/payment-requests/services/checkout-idempotency.service.ts
Current responsibility: (new)
Required change: honor Idempotency-Key on checkout / modal / verify (24h Redis/memory cache)
Risk: low
```

```text
File: modules/payment-requests/controllers/customer-payment-requests.controller.ts
Current responsibility: checkout entry + deprecated mint bridge
Required change: stop echoing session; wire Idempotency-Key; safe mint endpoint
Risk: low
```

---

## Cookie security (confirmed)

| Flag | Value |
| --- | --- |
| HttpOnly | `true` |
| SameSite | `Lax` |
| Secure | `COOKIE_SECURE` or `X-Forwarded-Proto === https` |
| Path | `/` |

No change to cookie flags in this ticket. Do not put long-lived session in a non-HttpOnly cookie.

---

## Idempotency

Frontend may send:

```http
Idempotency-Key: <uuid>
```

Honored on:

- `POST /payment-requests/checkout`
- `POST /payment-requests/checkout/modal`
- `POST /payment-requests/checkout/modal/verify`

Implementation: Redis/memory cache keyed by `userId + operation + key fingerprint`, TTL 24h. Missing header → normal one-shot behavior.

---

## Frontend contract (after backend ships)

1. Use **only** `paymentData.customerToken` from checkout/modal for GoKwik SDK  
2. Remove / disable Next.js `GET /api/checkout/gokwik-customer-token` session bridge  
3. Fail closed if `customerToken` is missing  

Until this backend is live everywhere, do not remove the FE bridge (checkout would break).

Optional backend bridge (safe): `POST /api/v1/payment-requests/checkout/gokwik-customer-token` — mints scoped opaque token only (never `user_session`). Deprecated in favor of modal `paymentData`.

---

## Acceptance tests

1. Login → `POST /payment-requests/checkout/modal` (GoKwik on)  
   - `paymentData.customerToken` present  
   - Value **≠** `user_session` cookie  
2. `Authorization: Bearer <customerToken>` on `/gokwik/get-cart` → success while unexpired  
3. After TTL / revoke → same Bearer → `401`  
4. Browser still uses HttpOnly `user_session` for `/auth/me`, cart, etc.  
5. Logs/responses never print full long-lived session tokens  
6. Bonus: GoKwik token on `/auth/me` or `/users/profile` → `401`  

---

## Env

| Variable | Default | Meaning |
| --- | --- | --- |
| `GOKWIK_CHECKOUT_TOKEN_TTL_SECONDS` | `2700` (45m) | Opaque token TTL |
| `GOKWIK_CHECKOUT_TOKEN_SECRET` | unused for opaque | Kept for env compatibility |

**Deploy:** run migration `AddUserSessionPurpose1785964000000` before/with this release.

---

## Suggested commit message

```text
fix(gokwik): mint short-lived customerToken instead of echoing user_session

Stop returning the long-lived storefront session to the browser for GoKwik SDK.
Issue a checkout-scoped opaque Bearer token with short TTL for merchant callbacks.
```

## Standup (one-liner)

> GoKwik ke liye long-lived `user_session` browser JSON me mat bhejo; short-lived scoped `customerToken` mint karo jo sirf GoKwik merchant callbacks pe Bearer ke through kaam kare.
