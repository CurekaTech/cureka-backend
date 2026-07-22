# Logging & Masking Policy

## Current state (post Phase 2 Pino)

**Good**

- `packages/logger` pino-http redacts: Authorization, Cookie, webhook signature headers, `password`, `token`, `otp`, `refreshToken`, `sessionToken`, `*.signature` / `*.secret`
- Access logs serialize method, path (no query), id, remoteAddress — not bodies
- OTP / auth dispatch logs use `maskMobile()` (`***` + last 4)
- Payment webhook controllers log IDs, not signatures (Phase 2 cleanup)

**Gaps (evidence)**

| Location | Issue | Severity |
|----------|-------|----------|
| `modules/shipping/services/shipping.service.ts` ~L78 | Logs full Shipway `payload` (name, phone, email, address) | Critical |
| `modules/shipping/services/shipway.service.ts` | Request/response body logging | Critical |
| `modules/shipping/services/shipping.service.ts` ~L448–462 | Validation log includes address phone | High |
| `modules/auth/services/admin-auth.service.ts` | Logs plaintext `email` on login success/fail | Medium |
| `modules/payment-requests/services/cashfree-payment.service.ts` | May log provider error JSON | Medium — **MVR** |
| Redis key design | Mobile number embedded in OTP rate-limit keys | Medium |
| pino redact | Does not cover `req.body.email` / `mobileNumber` / address fields | Medium |
| Application `Logger` objects | Bypass HTTP redact paths | Structural |

**Forbidden in logs (policy)**

Password, OTP plaintext, JWT, refresh/session tokens, Authorization, Cookie, payment signatures, CVV/PAN/card, Aadhaar, full medical narrative, full session tokens.

## Required masking helpers

| Field | Format |
|-------|--------|
| Mobile | `987*****10` or current `***3210` (standardize to show first 3 + last 2) |
| Email | `ab***@example.com` |
| Name | `J*** D***` (optional in debug) |
| Address | city/pincode only in logs; never full line1 |
| Payment IDs | last 4 of provider refs only |
| IP | optional truncate last octet |

## Implementation plan (do not implement in this audit)

1. Remove Shipway full-payload logs; log `orderId`, `orderNumber`, `statusCode` only.  
2. Add `maskEmail()` next to `maskMobile()`; use in admin-auth.  
3. Extend `LOG_REDACT_PATHS` for common body PII keys.  
4. Lint/CI gate: fail on `logger.*(payload` / unmasked mobile regex in modules.  
5. Document Cloud Logging retention (**MVR**).
