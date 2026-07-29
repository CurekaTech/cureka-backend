# DPDP Gap Analysis

**Act reference:** Digital Personal Data Protection Act, 2023 (India) — obligations interpreted for engineering planning only. Not legal advice.

| Obligation (engineering view) | Status | Evidence | Gap |
|-------------------------------|--------|----------|-----|
| Purpose limitation / notice | **MISSING** | No privacy-notice acceptance fields on `users` or registration DTOs | Need consent + notice versioning |
| Consent for processing | **MISSING** | No consent entity/API (`Glob **/*consent*` → 0) | Design in `consent-management-design.md` |
| Data minimization | **PARTIAL** | Profile collects gender, DOB, marital status; GoKwik DTO accepts optional `pan` | Review necessity; avoid storing PAN |
| Security safeguards | **PARTIAL** | bcrypt passwords/OTP; HttpOnly cookies; Phase 2 redact; **no helmet**; DB SSL `rejectUnauthorized: false`; staff-users unguarded | Phase 1 security fixes |
| Breach readiness | **MISSING** | No Sentry/alerting for unauthorized PII access; incomplete audit | Monitoring + audit expansion |
| Right to access / correction | **PARTIAL** | `GET/PATCH /users/me` for profile; no portable export | Export design required |
| Right to erasure | **PARTIAL** | Soft-delete helpers; no customer self-delete or anonymize | Deletion design required |
| Data principal grievance | **MISSING** | Support tickets exist but no DPDP grievance workflow | Process + API flag **MVR** |
| Cross-border transfer | **PARTIAL** | GCS, Razorpay, Cashfree, GoKwik, UniCommerce, Typesense receive/store data | Processor contracts **MVR** |
| Children’s data | **MISSING** | DOB collected; no age-gate / parental consent | Policy + validation **MVR** |
| Retention | **PARTIAL** | OTP 5 min expiry; session ~90 days; no purge jobs | Retention policy + jobs |
| Accountability / audit | **PARTIAL** | `audit_logs` only for blog + support | Expand audit types |

## Summary

Cureka is **not DPDP-ready for production** as a Data Fiduciary handling customer personal data. Core commerce and auth function, but **consent, DSAR export, complete erasure, and comprehensive audit** are absent. Security blockers (open staff-users, static OTP) compound privacy risk.
