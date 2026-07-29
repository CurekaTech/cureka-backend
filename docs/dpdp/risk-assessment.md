# Risk Assessment

Severity: Critical / High / Medium / Low. Effort: engineering days (order-of-magnitude).

| ID | Sev | Location | Description | Business risk | DPDP impact | Fix | Effort |
|----|-----|----------|-------------|---------------|-------------|-----|--------|
| R1 | Critical | `modules/users/controllers/staff-users.controller.ts` L24–26, L85–90 | Guards disabled; anon escalates to SUPER_ADMIN | Account takeover of staff | Unlawful access to personal data | Re-enable guards; remove fallback | 0.5d |
| R2 | Critical | `modules/auth/utils/otp.util.ts` L20 | OTP always `1234` | Account takeover of any mobile | Failure of security safeguards | Random OTP + SMS; no prod OTP in response | 2–4d |
| R3 | Critical | `modules/shipping/services/shipping.service.ts` ~L78; `shipway.service.ts` | Full shipping PII logged | Log exfiltration = breach | Logging excess personal data | Log IDs only; mask phone | 0.5d |
| R4 | Critical | Seed `Admin@1234` in `seed.runner.ts` | Hardcoded credential | Admin compromise | Safeguards | Env-only seed password | 0.5d |
| R5 | High | Shipway/Shiprocket webhook verify skip if secret empty | Forged shipment events | Fraud / wrong disclosure | Integrity of processing | Fail closed | 0.5d |
| R6 | High | GoKwik payment webhook HMAC pending | Cannot process securely yet (fail-closed today) | Ops blocked; risk if later fail-open | Safeguards | Implement HMAC; keep fail-closed | 1–2d + vendor |
| R7 | High | No consent model | Processing without recorded consent/notice | Regulatory exposure | Consent obligation | Implement consent design | 3–5d |
| R8 | High | No customer erasure / anonymize | Cannot honour deletion requests | Regulatory + trust | Right to erasure | Implement deletion design | 5–8d |
| R9 | High | No personal data export | Cannot honour access/portability | Regulatory | Right to access | Implement export design | 2–4d |
| R10 | High | Redis session cache stores full profile | Redis breach = full PII dump | Breach scale | Safeguards / minimization | Cache minimal claims | 1–2d |
| R11 | High | UniCommerce/Shipway outbound PII | Third-party transfer | Processor risk | Cross-border / processor | Contracts **MVR** + minimize fields | Legal + 1d |
| R12 | High | DB SSL `rejectUnauthorized: false` | MITM on DB link | Breach in transit | Safeguards | Pin CA | 1d + infra |
| R13 | Medium | Admin auth logs plaintext email | Email in logs | Log PII | Logging | maskEmail | 0.5d |
| R14 | Medium | Audit only blog/support | Cannot demonstrate accountability | Investigation gaps | Accountability | Expand audit events | 3–5d |
| R15 | Medium | OTP/mobile rows never purged | Indefinite mobile retention | Retention breach | Retention | Purge job | 1–2d |
| R16 | Medium | GoKwik DTO optional `pan` | Sensitive ID intake | Over-collection | Minimization | Drop field unless required | 0.5d |
| R17 | Medium | Profile DOB/gender/marital without purpose doc | Over-collection | Minimization | Mark optional + purpose in notice **MVR** | Legal + UI |
| R18 | Medium | No helmet/CSP/HSTS in app | Browser/API header gaps | XSS/session risk | Safeguards | Helmet or edge headers | 0.5–1d |
| R19 | Medium | Swagger always on | API surface disclosure | Attack mapping | Safeguards | Gate in production | 0.5d |
| R20 | Low | Typesense health concern names | Taxonomy only | Low if not user-linked | — | Document as non-PHI | 0.5d |
| R21 | Low | Testimonials name/city | Possibly real persons | Public marketing | Notice/consent for testimonials | Process **MVR** | Process |

## Manual Verification Required (no code proof)

- Production TLS termination, HSTS, WAF  
- Cloud Logging / backup encryption & retention  
- Processor agreements (Razorpay, Cashfree, GoKwik, Shipway, GCS, UniCommerce, Typesense)  
- Whether abandoned-cart JSONB in prod contains full PII  
- Tax/financial retention years for orders in India  
- Children’s data / age-gating policy  
- DPO / grievance officer appointment  
