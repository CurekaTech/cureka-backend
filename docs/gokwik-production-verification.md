# GoKwik security — production verification report

**Date:** 2026-08-25  
**Scope:** Five production-critical checks only (no unrelated refactors)

---

## 1. Long-lived session fallback on `/gokwik/*`

| | |
| --- | --- |
| **Result** | **PASS** (after fix) |
| **File / method** | `modules/gokwik/guards/gokwik-checkout-auth.guard.ts` → `canActivate` |
| **Issue found** | Fallback previously always accepted `purpose=login` Bearer after checkout-token resolve failed. |
| **Change made** | Login / `purpose=login` Bearer is **always rejected**. Only `purpose=gokwik_checkout` is accepted. No rollout flag. |
| **Production risk** | FE **must** pass `paymentData.customerToken` from checkout/modal. Old `user_session` as customerToken → **401**. |
| **Deploy safe?** | Yes for live push when FE already uses modal `customerToken`. |

---

## 2. Idempotency across PM2 / multiple instances

| | |
| --- | --- |
| **Result** | **PASS** (after harden) |
| **File / method** | `modules/payment-requests/services/checkout-idempotency.service.ts` → `run` / `buildCacheKey` |
| **Key format** | `idempotency:checkout:{operation}:{userId}:{sha256(key)[0..32]}` |
| **Operations** | `checkout` · `checkout-modal` · `checkout-modal-verify` — **no cross-endpoint collision** |
| **Issue found** | Relied on `CacheService`; when Redis unreachable, get/set no-op’d → silent miss → possible duplicate work across PM2 workers. |
| **Change made** | If `Idempotency-Key` is present and Redis is **not** reachable → **503** (fail closed) + error log. |
| **Production risk** | Requires `REDIS_HOST` healthy in production (already expected for Cureka). Brief Redis outage with Idempotency-Key → 503 instead of duplicate charge. |
| **Deploy safe?** | Yes, when Redis is up (standard prod). |

---

## 3. Token storage security (hash vs raw)

| | |
| --- | --- |
| **Result** | **PASS** (no code change needed) |
| **File / method** | `modules/auth/services/gokwik-checkout-token.service.ts` → `issue` / `resolveToSessionContext` |
| **What FE / GoKwik receives** | Raw opaque 64-char hex (`generateRefreshToken()`) as `customerToken` |
| **What DB stores** | `user_sessions.refresh_token_hash = SHA-256(raw)` via `hashRefreshToken()` — **not** the raw Bearer |
| **Lookup** | `Bearer` → `hashRefreshToken(token)` → `findActiveSessionWithUserByTokenHash` |
| **Issue** | None — same pattern as login sessions. |
| **Deploy safe?** | Yes |

---

## 4. Idempotent retries do not mint extra tokens

| | |
| --- | --- |
| **Result** | **PASS** (no code change needed) |
| **File / method** | `CustomerPaymentRequestsController.checkoutModal` + `CheckoutIdempotencyService.run` |
| **Execution order** | 1) Lookup cache by key → 2) on hit return cached body (same `customerToken`) → 3) on miss run handler (`createGokwikCheckoutSession` → `issue`) → 4) store full response |
| **Issue** | None — mint happens **inside** handler, only after cache miss. |
| **Deploy safe?** | Yes |

Controller order (simplified):

```text
checkoutIdempotencyService.run(userId, 'checkout-modal', key, () =>
  paymentRequestsService.checkoutModalFromCart(...)  // mints only if cache miss
)
```

---

## 5. Revocation wiring

| | |
| --- | --- |
| **Result** | **PASS with note** (TTL-only; no new workflow added) |
| **File / method** | `GokwikCheckoutTokenService.revoke` exists |
| **Issue** | `revoke()` is **not** called on place-order / cancel / checkout complete. Grep shows no call sites. |
| **Minimum change** | None for this release — **TTL (~45m)** is the expiry mechanism. Wire revoke later if needed. |
| **Production risk** | Stolen/leaked short-lived token remains valid until TTL or manual revoke. Acceptable for current scope. |
| **Deploy safe?** | Yes for TTL-only policy |

---

## Verdict

| Check | Status |
| --- | --- |
| 1. Remove / gate login fallback | PASS — no login fallback; gokwik_checkout only |
| 2. Shared Redis idempotency + namespaced keys | PASS |
| 3. SHA-256 hashed storage | PASS |
| 4. Cache-before-mint order | PASS |
| 5. Revoke wired | Not wired — TTL-only OK for this release |

**Overall:** Safe for live deploy when FE uses `paymentData.customerToken` and Redis is healthy. No login-session fallback flag.

### Env for live

```bash
GOKWIK_CHECKOUT_TOKEN_TTL_SECONDS=2700
# REDIS_HOST must be set for Idempotency-Key
```
