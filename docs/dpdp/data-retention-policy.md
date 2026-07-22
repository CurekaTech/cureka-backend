# Data Retention Policy (Recommended)

**Status:** Design / policy recommendation only — **not implemented** in code (no `@Cron` / ScheduleModule PII cleanup found).

| Data category | Current behaviour (code) | Recommended retention | Action |
|---------------|--------------------------|----------------------|--------|
| OTP rows (`otp_logs`) | Expiry 5 min for verification; rows kept forever with plaintext mobile | Delete/anonymize within **24 hours** of expiry | Scheduled purge job |
| OTP Redis counters | TTL windows (cooldown / 15 min rate limit) | Keep as-is | None |
| User sessions | ~90 days (`JWT_REFRESH_EXPIRES_IN_DAYS`); revoke on use if expired | **90 days** idle max; hard-delete revoked/expired weekly | Cleanup job |
| Session Redis cache | `SESSION_CACHE_TTL` default 300s | Prefer cache **userId + role only** (minimize) | Change cache shape |
| Users (active) | Soft-delete available | Account life + **30 days** grace after erasure request | Erasure workflow |
| Users (soft-deleted) | `deletedAt` set; PII remains | Anonymize within **30 days**; hard-delete identifiers | Anonymize job |
| Addresses | Soft-delete | Same as user; unlink on erasure | Cascade anonymize |
| Orders / payment_requests | Order soft-delete unused; payment_requests soft-delete exists | **8 years** financial (consult tax counsel) **MVR**; anonymize personal fields after warranty/return window if law allows | Legal + anonymize script |
| GoKwik webhook / abandoned JSONB | Retained indefinitely | **90 days** raw payload; keep IDs only after | Purge/minimize |
| Support tickets / messages | Soft-delete base; no erase API | **3 years** or until resolved + 1 year **MVR** | Policy |
| Audit logs | Append-only; blog/support only today | **3–7 years** security/compliance **MVR** | Expand + retain |
| Application logs (Cloud Logging) | Not configured in repo | **30–90 days** hot; longer cold archive **MVR** | Infra |
| Profile images / uploads | GCS/local until deleted | Delete object on erasure | Storage delete |
| Wishlist Redis | Tied to userId | Drop on erasure | Invalidate |

## Principles

1. Do not retain personal data longer than purpose requires.  
2. Financial/order history may outlive account erasure via **anonymization**, not indefinite identifiable storage.  
3. Document each purpose ↔ retention period in the privacy notice (**Manual Verification Required** — legal).  
4. Implement jobs only after legal sign-off on periods above.
