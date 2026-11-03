# Doctor Panel – Backend Integration Contract (Phase 1)

**Status:** **Implemented (Phase 1)** — core doctor auth, legal acceptance, consultations, earnings summary, public discovery, customer booking, and admin onboarding routes are live in the shared API. Sections below mark **Existing** vs **Proposed** (not yet implemented).  
**Audience:** Developer building the separate Doctor Panel frontend.  
**Backend:** Shared Cureka NestJS API + PostgreSQL (same as Customer Frontend and Super Admin).  
**Phase 1 consultation mode:** Offline clinic appointments only. No audio/video/chat/WebRTC/Zoom.

**Module flag:** Backend `DOCTOR_CONSULTATION_MODULE_ENABLED` (default `false`). When false, Admin Doctors menu is omitted, doctor/consultation APIs return 404, and storefront/Admin UIs hide the module. Frontends read `GET /public/doctor-consultation/config` → `{ enabled }`.

**Phase 1 stubs (Customer + Admin):**
- Consultation **payment verify** (`POST /consultations/:refId/verify-payment`) uses **stub** provider/`verifyPaid` until Cashfree is wired.
- Booking **OTP** field is accepted but verification is a **stub** (treated as verified when present).

### Existing HTTP routes (controllers)

| Area | Prefix / paths |
|------|----------------|
| Doctor auth | `POST /doctor/auth/login`, `refresh`, `logout`; `GET /doctor/auth/me`; `POST /doctor/auth/change-password`; `GET /doctor/auth/legal-documents`; `POST /doctor/auth/legal-documents/accept` |
| Doctor consultations | `GET /doctor/consultations`, `GET /doctor/consultations/:refId`, `POST .../complete`, `.../cancel`, `.../reschedule`, `.../follow-up/recommend`, `PATCH .../attendance`, `PUT .../prescription`, `GET .../documents` |
| Doctor earnings | `GET /doctor/earnings/summary?from&to` |
| Public discovery | `GET /public/doctors`, `GET /public/doctors/:slug`, `GET /public/doctors/:slug/slots?clinicId&from&to` |
| Customer consultations | `POST /consultations`, `GET /consultations`, `GET /consultations/:refId`, `POST .../cancel`, `POST .../reschedule`, `POST .../verify-payment`, `POST /consultations/follow-up/book` |
| Admin doctors | `GET/POST/PATCH …` under `/admin/doctors`; `POST :refId/availability`, `POST :refId/slots/generate`; approve/reject/status |
| Admin masters | `/admin/doctor-masters` (qualifications, specializations, languages CRUD) |
| Admin legal | `/admin/doctor-legal-documents` (draft, publish, versions) |
| Admin consultations | `GET /admin/consultations`, `GET .../reports/summary`, `GET/PUT .../follow-up-policy`, cancel/reschedule |

### Key enums (Phase 1)

- **DoctorCategory:** `DOCTOR`, `EXPERT`
- **DoctorStatus:** `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `SUSPENDED`
- **DoctorPricingType:** `FREE`, `PAID`
- **DoctorConsultationMode:** `OFFLINE` (Phase 1 default in config JSON)
- **DoctorSlotStatus:** `OPEN`, `HELD`, `BOOKED`, `BLOCKED`
- **ConsultationStatus:** `DRAFT`, `AWAITING_PAYMENT`, `CONFIRMED`, `COMPLETED`, `NO_SHOW`, `CANCELLED_BY_*`, `RESCHEDULED`, `EXPIRED`, `PAYMENT_RECEIVED_NEEDS_REALLOCATION`
- **ConsultationPaymentStatus:** `NONE`, `PENDING`, `PAID`, `FAILED`, `EXPIRED`, `REFUND_PENDING`, `REFUNDED`, `REFUND_FAILED`

**SOW note:** Doctor Panel features map primarily to SOW **§1.11**. Super Admin onboarding/verification maps to **§2.10**. Consultation monitoring for admins maps to **§2.11**. Page numbers are not cited; section numbers only.

---

## 1. Architecture and ownership

```text
Doctor Panel (separate app)
  -> Cureka API (/api/v1)
  -> Doctor Module + Consultation Module
  -> Shared PostgreSQL

Do not create a separate doctor backend or database.
Do not re-implement booking, payment, eligibility, refund, or legal-acceptance rules in the Panel.
```

| Owner | Responsibility |
|-------|----------------|
| Backend | Auth, legal document versions/acceptances, guards, authorization, slot safety, payments, clinical persistence, earnings aggregates, notifications |
| Doctor Panel | UI, calling APIs, displaying returned state |
| Super Admin | Creates doctor accounts; publishes Doctor T&C + Privacy Policy; configures profile/fees/bank; approves/activates (**SOW 2.10**) |
| Customer Frontend | Discovery, booking, payment, customer cancel/reschedule, follow-up booking |

Customer CMS Terms/Privacy (`cms_pages`) are **not** used for doctor acceptance.

---

## 2. Environment configuration

| Variable (Panel) | Purpose |
|------------------|---------|
| API base URL | e.g. `https://api.example.com/api/v1` |
| Auth transport | Prefer httpOnly cookie `doctor_token` if first-party; else `Authorization: Bearer <accessToken>` |

**Existing platform conventions**
- Success: `{ success: true, data, message?, timestamp }`
- Error: `{ success: false, code?, message, timestamp }` — branch on `code`
- Doctor auth is a **separate** realm from admin `admin_token` and customer session.

---

## 3. Authentication model (Confirmed business decision)

- Super Admin creates the doctor account and sets email + initial password.
- Doctor logs in with **email and password only**.
- No public self-registration.
- **No doctor OTP authentication.**
- Passwords hashed server-side; never returned in responses.
- Isolated from customer session auth and Super Admin JWT.

### How this relates to existing Cureka auth

| Persona | Existing pattern | Doctor Panel |
|---------|------------------|--------------|
| Customer | Opaque `user_session` + `POST /auth/refresh` rotation (hashed in `user_sessions`) | **Reuse pattern** for refresh hashing/rotation utilities — **not** the same table |
| Super Admin | Long-lived JWT `admin_token`; **no refresh API**; 401 → logout | **Reuse** JwtModule signing style for doctor **access** JWT — **not** admin cookie/guard; doctor access TTL is shorter and refresh is required |

Doctor auth is a **hybrid**: short-lived **access JWT** + long-lived **opaque refresh token** stored as SHA-256 hash in Proposed `doctor_sessions`.

### Access token and refresh token lifecycle (Proposed)

1. Admin creates account → doctor receives credentials securely.
2. `POST /doctor/auth/login` → `accessToken` + `refreshToken` (+ optional HttpOnly cookies).
3. Panel sends `Authorization: Bearer <accessToken>` (and/or access cookie) on API calls.
4. On `401` / `TOKEN_EXPIRED`, Panel calls `POST /doctor/auth/refresh` **once** (single-flight mutex for concurrent requests).
5. Backend validates refresh hash, rotates refresh (invalidate previous), returns new access + refresh.
6. Panel retries the original request with the new access token.
7. If refresh fails (expired/revoked/inactive doctor) → clear tokens → forced login.
8. `POST /doctor/auth/logout` revokes the current refresh session.
9. If `mustChangePassword` → change-password gate.
10. If pending legal acceptances → legal gate.
11. Operational APIs unlock only when: APPROVED + active + password OK + **both current published Doctor T&C and Privacy Policy versions accepted**.

**Important:** A valid refresh/access token **never** bypasses legal acceptance or password-change gates.

### Token security expectations

- Access JWT: configurable short expiry (`DOCTOR_JWT_EXPIRES_IN`).
- Refresh: longer configurable expiry (`DOCTOR_REFRESH_EXPIRES_IN_DAYS`); **hashed at rest**; never logged.
- Refresh rotation on every successful refresh.
- Logout / suspend / admin password reset → revoke session(s); refresh cannot mint new access tokens.
- Inactive, suspended, rejected, or blocked doctors cannot login or refresh.
- Multi-device sessions allowed by default (like customer), unless business later restricts to one.

### Cookie vs Bearer (deployment choice)

Backend should accept the same flexibility as customer auth where practical:

- HttpOnly cookies when Panel shares a cookie domain with the API (preferred for XSS resistance; plan CSRF strategy).
- Bearer access token + refresh via cookie or JSON body for cross-origin Panel hosts.

Document the chosen mode in the Panel env README when implementing. Trade-off: cross-origin Bearer refresh in JS-accessible storage is weaker than HttpOnly cookies.

### Frontend interceptor / concurrent refresh (required)

Mirror customer storefront behavior ([Cureka-frontend `axiosInstance`](../..) conceptually):

1. On 401 for a protected route, if not already retrying and not the refresh URL itself:
2. Enter a **shared refresh promise** (only one refresh in flight).
3. All concurrent failed requests await that same promise.
4. On refresh success, retry originals with new access token.
5. On refresh failure, clear session and redirect to login (forced logout).

Do not fire N parallel refresh calls for N simultaneous 401s.

### Forced logout scenarios

- Refresh token expired or revoked
- Doctor deactivated / suspended / rejected
- Admin reset password (sessions revoked)
- Explicit logout
- Optional: refresh reuse detection if enabled server-side

---

## 4. Doctor Legal Documents – mandatory acceptance (Phase 1)

### Business rules

- Documents managed by Super Admin: **Doctor Terms & Conditions** and **Doctor Privacy Policy**.
- Acceptance is **version-based**, not a permanent boolean.
- Publishing a new version requires re-acceptance of **that document type only**.
- Previous acceptance records remain for audit; never overwritten.
- Frontend checks are insufficient; backend guard enforces acceptance on operational APIs.
- Doctor must not bypass the acceptance screen.

### Expected frontend flow

1. Login succeeds.
2. Complete password change if required.
3. Read `pendingLegalAcceptances` from login/`me`.
4. If non-empty, show full-screen legal gate (no main navigation).
5. `GET /doctor/auth/legal-documents` — render both documents (highlight pending).
6. Doctor opens/reads each required document; checks an explicit checkbox per pending document.
7. `POST /doctor/auth/legal-documents/accept` with version IDs for each accepted document.
8. On success, refresh `me`; if no pending items, enter Doctor Panel shell.
9. If Super Admin later publishes a new version, next authenticated request returns `LEGAL_ACCEPTANCE_REQUIRED` and Panel re-enters the gate for **only the updated document**.

### Allowed endpoints while legal acceptance (or password change) is pending

- `GET /doctor/auth/me`
- `POST /doctor/auth/refresh` (session keep-alive; still subject to doctor active status)
- `POST /doctor/auth/change-password`
- `GET /doctor/auth/legal-documents`
- `POST /doctor/auth/legal-documents/accept`
- `POST /doctor/auth/logout`
- Forgot/reset password public endpoints

All other Doctor Panel APIs return `403` with `LEGAL_ACCEPTANCE_REQUIRED` or `PASSWORD_CHANGE_REQUIRED`.

---

## 5. Auth and legal APIs

Base prefix: `/doctor/auth`

| Method | Path | Auth | Status | Purpose |
|--------|------|------|--------|---------|
| POST | `/doctor/auth/login` | Public | **Existing** | Email/password → access + refresh |
| POST | `/doctor/auth/refresh` | Refresh cookie/body | **Existing** | Rotate refresh; new access + refresh |
| POST | `/doctor/auth/logout` | Doctor JWT | **Existing** | Revoke current session |
| GET | `/doctor/auth/me` | Access JWT | **Existing** | Profile + gate flags |
| POST | `/doctor/auth/change-password` | Access JWT | **Existing** | Current + new password; revokes all sessions |
| POST | `/doctor/auth/forgot-password` | Public | Proposed | Email reset start |
| POST | `/doctor/auth/reset-password` | Public | Proposed | Complete reset; revoke all sessions |
| GET | `/doctor/auth/legal-documents` | Access JWT | **Existing** | Active published T&C + Privacy (+ pending flags) |
| POST | `/doctor/auth/legal-documents/accept` | Access JWT | **Existing** | Accept one or both current versions |

### Login request (Proposed)

```json
{
  "email": "doctor@example.com",
  "password": "TempPass#123"
}
```

### Login success `data` (Proposed)

```json
{
  "accessToken": "<jwt>",
  "accessTokenExpiresIn": 900,
  "tokenType": "Bearer",
  "refreshToken": "<opaque-refresh>",
  "refreshTokenExpiresIn": 7776000,
  "sessionId": "dsess_xxx",
  "doctor": {
    "refId": "doc_xxx",
    "fullName": "Dr. Example",
    "email": "doctor@example.com",
    "category": "DOCTOR",
    "status": "APPROVED",
    "isActive": true,
    "mustChangePassword": false,
    "legalDocumentsAccepted": false,
    "pendingLegalAcceptances": [
      {
        "documentType": "TERMS_AND_CONDITIONS",
        "documentRefId": "dld_terms",
        "versionRefId": "dldv_12",
        "versionNumber": 3,
        "title": "Doctor Terms & Conditions"
      },
      {
        "documentType": "PRIVACY_POLICY",
        "documentRefId": "dld_privacy",
        "versionRefId": "dldv_8",
        "versionNumber": 2,
        "title": "Doctor Privacy Policy"
      }
    ]
  }
}
```

When both current versions are accepted, `legalDocumentsAccepted` is `true` and `pendingLegalAcceptances` is `[]`.

`GET /doctor/auth/me` returns the same `doctor` object (without minting new tokens).

### Refresh request (Proposed)

Send the current refresh token via HttpOnly cookie **or** JSON body (customer-compatible flexibility):

```json
{
  "refreshToken": "<opaque-refresh>"
}
```

### Refresh success `data` (Proposed)

```json
{
  "accessToken": "<new-jwt>",
  "accessTokenExpiresIn": 900,
  "tokenType": "Bearer",
  "refreshToken": "<new-opaque-refresh>",
  "refreshTokenExpiresIn": 7776000,
  "sessionId": "dsess_xxx"
}
```

Notes:
- Previous refresh token is invalidated (rotated).
- Doctor must still be APPROVED + active; otherwise refresh fails with `DOCTOR_NOT_ACTIVE`.
- Refresh success does **not** clear `PASSWORD_CHANGE_REQUIRED` or `LEGAL_ACCEPTANCE_REQUIRED` gates on subsequent operational calls.

### Logout (Proposed)

`POST /doctor/auth/logout`

May authenticate with access JWT and/or present refresh token to revoke the session.

```json
{
  "success": true,
  "data": { "revoked": true },
  "message": "Logged out successfully",
  "timestamp": "2026-11-03T08:00:00.000Z"
}
```

After logout, refresh must fail with `REFRESH_TOKEN_REVOKED` / `UNAUTHORIZED`.

### Fetch active legal documents (Proposed)

`GET /doctor/auth/legal-documents/active`

```json
{
  "documents": [
    {
      "documentType": "TERMS_AND_CONDITIONS",
      "documentRefId": "dld_terms",
      "title": "Doctor Terms & Conditions",
      "versionRefId": "dldv_12",
      "versionNumber": 3,
      "publishedAt": "2026-11-01T10:00:00.000Z",
      "contentHtml": "<p>…</p>",
      "acceptedByDoctor": false
    },
    {
      "documentType": "PRIVACY_POLICY",
      "documentRefId": "dld_privacy",
      "title": "Doctor Privacy Policy",
      "versionRefId": "dldv_8",
      "versionNumber": 2,
      "publishedAt": "2026-10-15T08:00:00.000Z",
      "contentHtml": "<p>…</p>",
      "acceptedByDoctor": true
    }
  ]
}
```

### Submit acceptance (Proposed)

Validation rules:
- Body must include at least one acceptance item.
- Each item requires `documentType`, `documentRefId`, `versionRefId`.
- `accepted: true` required (explicit confirmation).
- `versionRefId` must match the **currently published** version for that document type.
- Idempotent if the same version was already accepted.
- Reject stale/superseded version IDs with `LEGAL_VERSION_OUTDATED`.

```json
{
  "acceptances": [
    {
      "documentType": "TERMS_AND_CONDITIONS",
      "documentRefId": "dld_terms",
      "versionRefId": "dldv_12",
      "accepted": true
    },
    {
      "documentType": "PRIVACY_POLICY",
      "documentRefId": "dld_privacy",
      "versionRefId": "dldv_8",
      "accepted": true
    }
  ]
}
```

### Accept success `data` (Proposed)

```json
{
  "legalDocumentsAccepted": true,
  "pendingLegalAcceptances": [],
  "accepted": [
    {
      "documentType": "TERMS_AND_CONDITIONS",
      "versionRefId": "dldv_12",
      "acceptedAt": "2026-11-03T07:15:00.000Z"
    },
    {
      "documentType": "PRIVACY_POLICY",
      "versionRefId": "dldv_8",
      "acceptedAt": "2026-11-03T07:15:00.000Z"
    }
  ]
}
```

### Protected API without latest acceptance (Proposed)

```json
{
  "success": false,
  "code": "LEGAL_ACCEPTANCE_REQUIRED",
  "message": "Please accept the latest Doctor Terms & Conditions and/or Privacy Policy.",
  "timestamp": "2026-11-03T07:20:00.000Z",
  "data": {
    "pendingLegalAcceptances": [
      {
        "documentType": "TERMS_AND_CONDITIONS",
        "documentRefId": "dld_terms",
        "versionRefId": "dldv_13",
        "versionNumber": 4,
        "title": "Doctor Terms & Conditions"
      }
    ]
  }
}
```

HTTP status: `403`.

### Account gate matrix

| Condition | Login | Password / Legal APIs | Operational APIs |
|-----------|-------|------------------------|------------------|
| PENDING_REVIEW / DRAFT / REJECTED / SUSPENDED | Limited or denied | Per policy | Denied |
| APPROVED + inactive | May login | Yes | Denied `DOCTOR_NOT_ACTIVE` |
| mustChangePassword | Yes | Yes | Denied `PASSWORD_CHANGE_REQUIRED` |
| pending legal acceptances | Yes | Yes | Denied `LEGAL_ACCEPTANCE_REQUIRED` |
| All gates clear | Yes | Yes | Allowed |

---

## 6. Authorization rules (doctor-specific)

- Token embeds `doctorId` / `refId`.
- Consultation/slot/document access must match that doctor.
- Cross-doctor access → `403 FORBIDDEN`.
- Bank details never returned on doctor APIs.
- Follow-up pricing is server-calculated; doctor cannot set fee unless admin granted override permission (default: no).

---

## 7. Dashboard including earnings summary

**Existing:** `GET /doctor/earnings/summary?from&to` — earnings aggregates for the authenticated doctor (visibility only; no automated payout).

**Proposed:** `GET /doctor/me/dashboard` — combined schedule + earnings widget (not implemented as a single endpoint yet).

Earnings visibility is in Phase 1. Automated payout is out of scope.

```json
{
  "schedule": {
    "todayCount": 3,
    "upcomingCount": 12,
    "completedCount": 40,
    "awaitingPrescriptionCount": 2,
    "openFollowUpRecommendations": 1
  },
  "earningsSummary": {
    "currency": "INR",
    "totalConsultationAmount": 19960,
    "paidConsultationCount": 38,
    "freeConsultationCount": 5,
    "cancelledOrRefundedAmount": 1497,
    "pendingSettlementAmount": 5000,
    "note": "Visibility only; automated payout is not enabled in Phase 1"
  },
  "earningsByDay": [
    { "date": "2026-11-01", "amount": 1497, "paidCount": 3, "freeCount": 1 }
  ],
  "earningsByMonth": [
    { "month": "2026-11", "amount": 19960, "paidCount": 38, "freeCount": 5 }
  ]
}
```

Query params (Proposed): `from`, `to`.

---

## 8. Profile (Proposed)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/doctor/me/profile` | Professional profile |
| PATCH | `/doctor/me/profile` | Non-sensitive fields only |

---

## 9. Clinic-linked availability and slots (Proposed)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/doctor/me/clinics` | Linked clinics/venues |
| GET | `/doctor/me/availabilities` | Rules/leaves by clinic |
| PUT | `/doctor/me/availabilities` | Update rules |
| GET | `/doctor/me/slots?from=&to=&clinicId=` | Concrete slots |
| POST | `/doctor/me/slots/block` | Block range/slot |
| POST | `/doctor/me/slots/:refId/unblock` | Unblock if allowed |

Backend prevents overlapping BOOKED/HELD appointments for the same doctor across clinics.

---

## 10. Appointments / consultation lifecycle

**Existing** doctor prefix: `/doctor/consultations`

| Method | Path | Status | Purpose |
|--------|------|--------|---------|
| GET | `/doctor/consultations` | **Existing** | List + filters (`status`, pagination) |
| GET | `/doctor/consultations/:refId` | **Existing** | Detail |
| POST | `/doctor/consultations/:refId/complete` | **Existing** | Mark completed (+ optional notes/diagnosis body) |
| POST | `/doctor/consultations/:refId/cancel` | **Existing** | Doctor cancel + reason |
| POST | `/doctor/consultations/:refId/follow-up/recommend` | **Existing** | Recommend follow-up |
| POST | `/:refId/attendance` | Proposed | Attendance / no-show |
| POST | `/:refId/notes` | Proposed | Notes-only |
| POST | `/:refId/diagnosis` | Proposed | Diagnosis-only |
| POST | `/:refId/prescriptions` | Proposed | Structured Rx and/or upload |
| GET | `/:refId/documents` | Proposed | Patient docs (signed URLs) |
| POST | `/:refId/reschedule` | Proposed | Doctor reschedule if policy allows |

**Existing** customer prefix: `/consultations` (session cookie) — `POST /` book, `GET /` history, `GET /:refId`, `POST /:refId/cancel`, `POST /:refId/verify-payment`, `POST /follow-up/book`.

### List filters / pagination (Proposed)

`status`, `from`, `to`, `clinicId`, `q`, `page`, `limit`, `sortBy`, `sortOrder`, `awaitingPrescription`, `isFollowUp`

```json
{
  "items": [],
  "total": 100,
  "page": 1,
  "limit": 20,
  "pageCount": 5
}
```

### Detail example (Proposed)

```json
{
  "refId": "con_xxx",
  "status": "CONFIRMED",
  "isFollowUp": false,
  "parentConsultationRefId": null,
  "followUpChildren": [],
  "scheduledStart": "2026-11-10T04:30:00.000Z",
  "scheduledEnd": "2026-11-10T05:00:00.000Z",
  "clinic": {
    "refId": "cl_xxx",
    "name": "Example Clinic",
    "address": "12 MG Road, Bengaluru"
  },
  "pricingType": "PAID",
  "amountCharged": 499,
  "paymentStatus": "PAID",
  "patient": {
    "name": "Asha",
    "mobileMasked": "******3210"
  },
  "symptoms": "Persistent cough",
  "documents": [
    {
      "refId": "cd_1",
      "name": "lab-report.pdf",
      "contentType": "application/pdf",
      "url": "https://signed.example/..."
    }
  ],
  "attendanceStatus": "PENDING",
  "notes": null,
  "diagnosis": null,
  "prescription": null,
  "followUpRecommendation": null,
  "cancellation": null
}
```

### Status values (Proposed)

`AWAITING_PAYMENT`, `CONFIRMED`, `COMPLETED`, `NO_SHOW`, `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_DOCTOR`, `CANCELLED_BY_ADMIN`, `RESCHEDULED`, `EXPIRED`, `PAYMENT_RECEIVED_NEEDS_REALLOCATION`

---

## 11. Attendance, notes, diagnosis, prescriptions

### Attendance (Proposed)

```json
{ "attendanceStatus": "PRESENT" }
```

Values: `PENDING`, `PRESENT`, `NO_SHOW`

### Notes / diagnosis (Proposed)

```json
{ "body": "Advised review in one week." }
```

```json
{ "diagnosis": "Acute seasonal allergic rhinitis" }
```

### Prescription (Proposed)

```json
{
  "items": [
    {
      "medicineName": "Cetirizine 10mg",
      "dosage": "1 tablet",
      "frequency": "Once daily",
      "duration": "5 days",
      "instructions": "After food"
    }
  ],
  "additionalNotes": "Avoid known allergens"
}
```

---

## 12. Follow-up recommendation and booking visibility

Create only after `COMPLETED`:

`POST /doctor/consultations/:refId/follow-up/recommend`

```json
{
  "reason": "Review symptom progression",
  "instructions": "Bring prior lab reports",
  "recommendedFrom": "2026-11-17",
  "recommendedTo": "2026-11-24"
}
```

Do not send fee/free flags unless override permission exists. Backend returns computed eligibility. Customer books on Customer Frontend. Panel shows recommendation status and linked child consultation (`parentConsultationRefId`).

---

## 13. Cancel / reschedule from Doctor Panel (Proposed)

### Cancel

```json
{ "reason": "Doctor unavailable due to emergency" }
```

### Reschedule

```json
{
  "newSlotRefId": "slot_yyy",
  "reason": "Clinic schedule change"
}
```

---

## 14. File upload and secure document access

- Patient documents: signed URLs from consultation detail/documents.
- Prescription PDF upload (if enabled): authenticated multipart (**Proposed**).
- Access denied for documents not belonging to the authenticated doctor.

---

## 15. Notifications (Proposed)

`GET /doctor/me/notifications` — optional in-app list.  
Backend email/SMS for bookings, reminders, cancel/reschedule, documents, prescription pending, approval updates, and **new legal document version requiring re-acceptance**.

---

## 16. Error codes and validation (Proposed)

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing/invalid access token |
| `TOKEN_EXPIRED` | 401 | Access JWT expired — Panel should refresh |
| `REFRESH_TOKEN_INVALID` | 401 | Unknown/malformed refresh |
| `REFRESH_TOKEN_REVOKED` | 401 | Logged out or session revoked |
| `REFRESH_TOKEN_EXPIRED` | 401 | Refresh past expiry |
| `REFRESH_TOKEN_REUSED` | 401 | Optional family reuse detection |
| `PASSWORD_CHANGE_REQUIRED` | 403 | Must change password |
| `LEGAL_ACCEPTANCE_REQUIRED` | 403 | Must accept latest Doctor T&C and/or Privacy Policy |
| `LEGAL_VERSION_OUTDATED` | 409 | Submitted version is not the current published version |
| `DOCTOR_NOT_ACTIVE` | 403 | Pending/rejected/suspended/inactive — blocks login and refresh |
| `FORBIDDEN` | 403 | Cross-doctor or disallowed |
| `VALIDATION_ERROR` | 400 | Field errors |
| `CONSULTATION_INVALID_STATE` | 409 | Illegal transition |
| `FOLLOW_UP_NOT_ALLOWED` | 409 | Policy/eligibility failure |
| `FOLLOW_UP_PRICE_OVERRIDE_FORBIDDEN` | 403 | Unauthorized fee override |
| `SLOT_CONFLICT` | 409 | Overlap or unavailable slot |
| `CANCEL_NOT_ALLOWED` | 409 | Outside policy |

---

## 17. Features not available in Phase 1

- Audio/video/WebRTC/Zoom join
- In-app chat
- Doctor self-registration / OTP login
- Coupon/geo/membership free engines
- Automated doctor payouts
- Advertising / geo promotions
- Editing another doctor’s data
- Viewing full bank account details
- Using customer CMS Terms/Privacy as doctor legal documents

---

## 18. End-to-end flows

### Login → password → legal acceptance → dashboard

```text
POST /doctor/auth/login                    -> accessToken + refreshToken
POST /doctor/auth/change-password          (if mustChangePassword)
GET  /doctor/auth/legal-documents          (if pendingLegalAcceptances)
POST /doctor/auth/legal-documents/accept
GET  /doctor/earnings/summary              (Bearer accessToken)
```

### Access expiry → refresh → retry

```text
GET  /doctor/consultations                 -> 401 TOKEN_EXPIRED
POST /doctor/auth/refresh { refreshToken } -> new access + rotated refresh
GET  /doctor/consultations                 -> 200 (retry)
```

### Re-acceptance after admin publishes new T&C only

```text
GET /doctor/consultations      -> 403 LEGAL_ACCEPTANCE_REQUIRED
   pending: TERMS_AND_CONDITIONS only
GET  /doctor/auth/legal-documents
POST /doctor/auth/legal-documents/accept   { terms version only }
GET  /doctor/consultations                 -> 200
```

### Complete consultation + follow-up recommend

```text
GET  consultation detail
POST attendance
POST notes + diagnosis
POST prescription
POST complete
POST follow-up-recommendation
```

---

## 19. Local development checklist

1. Staging API + Super Admin publishes Doctor T&C and Privacy Policy, then provisions an APPROVED+ACTIVE doctor.
2. Confirm cookie vs Bearer strategy for Panel origin.
3. Implement gate UX order: password change → legal acceptance → main shell.
4. Handle `LEGAL_ACCEPTANCE_REQUIRED` globally (redirect to legal gate).
5. Re-sync this document when backend freezes DTOs.

---

## 20. Doctor Panel developer checklist

- [ ] Email/password login returning access + refresh
- [ ] Single-flight 401 refresh interceptor + retry
- [ ] Refresh rotation storage (cookie and/or secure handling)
- [ ] Logout revokes session; forced logout on refresh failure
- [ ] First-login password change + forgot/reset
- [ ] Fetch active Doctor T&C + Privacy Policy
- [ ] Mandatory dual acceptance with checkboxes; no bypass
- [ ] Handle version re-acceptance for one or both documents
- [ ] Gate codes: `PASSWORD_CHANGE_REQUIRED`, `LEGAL_ACCEPTANCE_REQUIRED`, token error codes
- [ ] Dashboard schedule + earnings summary (not payout UI)
- [ ] Profile read / allowed edits
- [ ] Clinics + availability + slots
- [ ] Consultations list/filters/pagination
- [ ] Detail, documents (signed URLs)
- [ ] Attendance, notes, diagnosis, prescription
- [ ] Complete consultation
- [ ] Follow-up recommendation (no unauthorized price override)
- [ ] Parent/child follow-up visibility
- [ ] Cancel / reschedule (policy-driven)
- [ ] No bank-detail screens; no A/V join UI; no customer CMS legal reuse

---

## 21. Related references

- SOW §1.10 Customer consultation module
- SOW §1.11 Doctor Panel module (incl. §1.11.2 agreement acceptance)
- SOW §2.10 Super Admin doctor onboarding & verification
- SOW §2.11 Super Admin consultation monitoring
- Workspace plan: Doctor Consultation Phase1

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | 2026-11-03 | Initial Proposed contract |
| 0.2 | 2026-11-03 | Final review corrections |
| 0.3 | 2026-11-03 | Versioned Doctor T&C + Privacy Policy APIs, acceptance DTOs, guard behavior, frontend flow |
| 0.4 | 2026-11-03 | Access/refresh token lifecycle, rotation, interceptor, auth error codes, reuse of customer/admin patterns |
| 1.0 | 2026-11-03 | Phase 1 implemented routes (auth, legal, consultations, earnings, public doctors, customer booking); stubs noted |
