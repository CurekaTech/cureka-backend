# Consent Management Design

**Status:** Not present in codebase. Design only.

## Goals

Capture and prove: privacy notice acceptance, terms acceptance, marketing opt-in/out, with version + timestamp + actor.

## Proposed schema

### Table `user_consents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | nullable for pre-registration capture |
| `consent_type` | enum | `privacy_policy`, `terms_of_service`, `marketing`, `cookie_analytics` |
| `version` | varchar | e.g. `2026-07-01` |
| `granted` | boolean | true=accept, false=withdraw |
| `granted_at` | timestamptz | |
| `source` | varchar | `registration`, `checkout`, `settings`, `admin` |
| `ip_address` | varchar nullable | optional evidence |
| `user_agent` | varchar nullable | optional |
| `created_at` | timestamptz | |

Unique partial index: latest active consent per (`user_id`, `consent_type`) via query, not hard unique.

### Config / CMS

Store current policy versions in `admin_settings` or env:

- `PRIVACY_POLICY_VERSION`
- `TERMS_VERSION`

## APIs

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/auth/consents` | Session or pre-OTP device | `{ types[], version, granted }` |
| GET | `/users/me/consents` | Session verified | Current grants |
| PATCH | `/users/me/consents/marketing` | Session | `{ granted: boolean }` |
| GET | `/admin/users/:refId/consents` | Admin | Audit view |

## Registration / checkout hooks

1. `CompleteRegistrationDto` requires `acceptedPrivacyVersion` + `acceptedTermsVersion` matching current.  
2. Checkout requires privacy/terms if not already granted.  
3. Marketing default **false** (opt-in).  

## Audit

Every grant/withdraw → `audit_logs` with entity `user_consent`.

## Out of scope for v1

Cookie banner UI (frontend); only persist choices the backend receives.
