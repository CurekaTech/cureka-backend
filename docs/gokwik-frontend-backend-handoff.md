# GoKwik `customerToken` security — why, backend, frontend

**Priority:** P0  
**Audience:** Frontend + Backend  
**Status:** Backend ready for live (strict — no login-token fallback)

---

## 1. Why this is required

### Old flow (unsafe)

```text
User logs in
  → Backend sets HttpOnly `user_session` cookie (long-lived, ~90 days)
  → Frontend cannot read the cookie from JS (HttpOnly — good)
  → But FE called a bridge / used checkout response that returned the SAME token
  → That value was passed to GoKwik SDK as `customerToken`
  → GoKwik called our APIs with: Authorization: Bearer <user_session>
```

### The problem

`HttpOnly` means `document.cookie` cannot read the session.  
But if an API **returns that same long-lived token in JSON**, JavaScript (or XSS) can steal it.

Result: full account takeover for ~90 days — cart, profile, orders, etc.

### Goal

```text
user_session     → stays HttpOnly, private, never in browser JSON for GoKwik
customerToken    → short-lived (~45 min), checkout-only, only for GoKwik SDK
```

---

## 2. What backend has done

### New flow

```text
Login
  → HttpOnly `user_session` (unchanged for normal storefront)

POST /api/v1/payment-requests/checkout
POST /api/v1/payment-requests/checkout/modal
  → Auth via cookie
  → Mints opaque short-lived token (purpose = gokwik_checkout, TTL 45 min)
  → Returns paymentData.customerToken = that new token (≠ user_session)

GoKwik SDK
  → customerToken / merchantParams.customerToken = paymentData.customerToken

GoKwik → our merchant APIs
  → Authorization: Bearer <gokwik_checkout token only>
  → Long-lived user_session Bearer → 401
```

### Behaviour summary

| Item | Behaviour |
| --- | --- |
| `paymentData.customerToken` | Always a **new** short-lived opaque token |
| Token ≠ `user_session` | Guaranteed |
| TTL | 45 minutes (`GOKWIK_CHECKOUT_TOKEN_TTL_SECONDS=2700`) |
| Bound to | User + cart (`merchantCheckoutId`) |
| DB | Stores **SHA-256 hash** only, not raw token |
| `/gokwik/*` | Accepts **only** `gokwik_checkout` Bearer |
| Normal APIs (`/auth/me`, cart, profile…) | Still use HttpOnly `user_session`; reject GoKwik token |
| Idempotency-Key | Honored on checkout / modal / verify (needs Redis) |

### Live env (backend)

```bash
GOKWIK_CHECKOUT_TOKEN_TTL_SECONDS=2700
```

Also run migration: `1785964000000-add-user-session-purpose.ts` (`user_sessions.purpose`).

### Optional / deprecated backend bridge

```http
POST /api/v1/payment-requests/checkout/gokwik-customer-token
```

Mints a safe short-lived token only (never returns `user_session`).  
**Prefer** `paymentData.customerToken` from checkout/modal. Do not rely on this long-term.

---

## 3. What frontend must change

### Required

1. **Open GoKwik SDK only with** `paymentData.customerToken` from:
   - `POST /api/v1/payment-requests/checkout/modal`, or  
   - `POST /api/v1/payment-requests/checkout`

2. **Remove / disable** the Next.js (or any) bridge that did:
   ```text
   read user_session cookie → return { customerToken: raw session }
   ```
   Example path often used: `GET /api/checkout/gokwik-customer-token`

3. **Fail closed** if `paymentData.customerToken` is missing — do **not** fall back to login `token` or cookie value.

4. Keep using HttpOnly `user_session` cookie for normal Cureka APIs (cart, profile, addresses) — **unchanged**.

5. Keep sending `Idempotency-Key` on checkout / modal / verify (backend caches response for 24h; Redis required).

### Do not

| Don’t | Why |
| --- | --- |
| Pass login response `token` to GoKwik | That’s the long-lived session |
| Read / echo `user_session` into GoKwik | Same security hole |
| Invent `customerToken` client-side | Must come from checkout/modal |
| Call `/gokwik/*` with session Bearer from FE | Those routes only accept checkout token (GoKwik server does this) |

### FE checklist

- [ ] Checkout/modal response → store `paymentData.customerToken` for SDK only  
- [ ] GoKwik init uses that value for `customerToken` / `merchantParams.customerToken`  
- [ ] Session bridge removed  
- [ ] Missing `customerToken` → block checkout + show error  
- [ ] Normal Cureka calls still cookie-based (no change)

---

## 4. Contract (copy for FE)

```ts
// After checkout/modal success when checkoutProvider === 'gokwik':
const { paymentData } = response;

if (!paymentData?.customerToken) {
  // Fail closed — do not open GoKwik
  throw new Error('GoKwik customerToken missing');
}

// Pass ONLY this to GoKwik SDK:
gokwik.open({
  ...paymentData,
  customerToken: paymentData.customerToken,
  // merchantParams.customerToken: paymentData.customerToken  // if SDK requires both
});
```

Response shape (unchanged except token value meaning):

```json
{
  "gateway": "gokwik",
  "checkoutProvider": "gokwik",
  "paymentData": {
    "merchantCheckoutId": "<cart-uuid>",
    "appId": "...",
    "merchantId": "...",
    "amount": 0,
    "currency": "INR",
    "environment": "sandbox|production",
    "customerToken": "<SHORT_LIVED_OPAQUE_TOKEN>",
    "customer": { "name": "...", "email": "...", "contact": "..." }
  }
}
```

---

## 5. Deploy order (live)

1. **Backend** deploy + migration + `GOKWIK_CHECKOUT_TOKEN_TTL_SECONDS=2700`  
2. **Frontend** deploy that uses modal `customerToken` and removes session bridge  
3. Verify one real checkout: GoKwik opens, get-cart/create-order succeed  
4. Confirm `/gokwik/*` with old session Bearer fails (401)

If FE is deployed **without** using modal `customerToken`, GoKwik callbacks will **401** (strict mode — intentional).

---

## 6. One-line summary

> Long-lived `user_session` must never go to GoKwik. Backend mints a 45-minute checkout-only `customerToken` in checkout/modal; frontend must use only that and delete the session bridge.
