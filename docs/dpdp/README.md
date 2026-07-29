# DPDP Compliance Audit — Cureka Backend

**Date:** 22 Jul 2026  
**Scope:** NestJS modular monolith (`apps/api`, `modules/`, `packages/`)  
**Method:** Evidence-based code review only. Items that cannot be verified from source are marked **Manual Verification Required**.  
**Constraint:** No business-logic code was modified for this audit.

---

## Scores (0–100)

| Score | Value | Rationale |
|-------|------:|-----------|
| **DPDP Compliance Score** | **28** | Consent, DSAR export, and complete erasure are missing; retention/audit incomplete; auth/PII logging gaps remain |
| **Privacy Risk Score** | **72** | High residual risk (staff-users open, static OTP, Shipway PII logs, plaintext PII at rest, third-party transfers) |
| **Logging Compliance Score** | **62** | Phase 2 Pino improved secrets redaction; application logs still emit email/phone/address (Shipway, admin auth) |
| **Data Protection Maturity Score** | **35** | Soft-delete & bcrypt/hashing exist; no field encryption, consent, retention jobs, helmet, or DSAR tooling |

> Privacy Risk Score is inverted risk (higher = worse). Other scores: higher = better.

---

## Document index

| Document | Purpose |
|----------|---------|
| [gap-analysis.md](./gap-analysis.md) | Gap vs DPDP obligations |
| [personal-data-inventory.md](./personal-data-inventory.md) | Personal data inventory |
| [data-flow-diagram.md](./data-flow-diagram.md) | End-to-end data flows |
| [data-retention-policy.md](./data-retention-policy.md) | Recommended retention (not implemented) |
| [logging-and-masking-policy.md](./logging-and-masking-policy.md) | Logging compliance + masking rules |
| [consent-management-design.md](./consent-management-design.md) | Consent schema + APIs (design only) |
| [audit-logging-design.md](./audit-logging-design.md) | Required audit events (design only) |
| [data-export-design.md](./data-export-design.md) | Right to access / export API design |
| [data-deletion-design.md](./data-deletion-design.md) | Right to erasure design |
| [risk-assessment.md](./risk-assessment.md) | Severity-ranked findings |

Interactive scorecard: open the companion canvas in Cursor if available (`dpdp-compliance-audit.canvas.tsx`).

---

## Prioritized roadmap

### Phase 1 — Critical compliance (before production / public traffic)

1. Re-enable `JwtAuthGuard` + `RolesGuard` on staff-users; remove SUPER_ADMIN fallback  
2. Replace static OTP `1234` with random OTP + SMS; never return OTP in production  
3. Stop logging Shipway full address/phone/email payloads; mask admin emails in auth logs  
4. Fail-closed Shipway/Shiprocket webhook secrets; complete GoKwik HMAC when contract arrives  
5. Document lawful purposes + appoint Data Protection contact (**Manual Verification Required** — legal)

### Phase 2 — High priority (rights & accountability)

6. Consent capture (privacy/terms/marketing) with version + timestamp  
7. Customer self-service erasure (soft-delete + anonymize orders/sessions/OTP)  
8. Personal data export API (`GET /users/me/data-export`)  
9. Expand audit entity types: auth, profile, payments, orders, admin actions  
10. OTP/session retention cleanup jobs; Redis session cache minimization  

### Phase 3 — Medium priority

11. Helmet / HSTS / CSP at edge or app  
12. Fix DB SSL `rejectUnauthorized: false` with pinned CA  
13. Expand pino redact for email/mobile/address body fields; `maskEmail` helper  
14. Minimize GoKwik abandoned-cart / webhook JSONB retention  
15. Admin PII access justification logging  

### Phase 4 — Long-term

16. Field-level encryption for mobile/email at rest (or cloud KMS column encryption)  
17. Formal DPDP notices, DPIA for health-product inference, processor contracts  
18. Log retention sinks (Cloud Logging sinks + lifecycle)  
19. Periodic access reviews / pen-test  

---

## Explicit non-goals of this audit package

- No code implementation of consent/export/erasure  
- No legal opinion substituting qualified counsel  
- CLI/seed scripts treated as ops tooling (out of runtime compliance path except seed password risk)  
