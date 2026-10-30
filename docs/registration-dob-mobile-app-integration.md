# Registration date of birth — Mobile App Integration

Use this guide so the mobile app collects **date of birth (DOB)** the same way the Cureka website does when a customer finishes registration after OTP.

Base path: `/api/v1`.

Related website behavior:

- After OTP, if the account still needs profile completion, the Register modal requires first name, last name, email, and **date of birth**.
- Submit calls `POST /auth/complete-registration` with ISO `dateOfBirth`.
- DOB is also required when a new customer completes registration via `PATCH /users/profile`.
- Existing registered customers can still update DOB later from My Profile (optional on update).

---

## 1. What changed

| Before | After |
|---|---|
| Registration body: `firstName`, `lastName`, optional `email` | Same fields **plus required** `dateOfBirth` |
| App could finish register without DOB | Server rejects registration without a valid DOB |
| DOB only on profile edit | DOB must be collected on first-time registration |

---

## 2. Rules the app must keep

1. Show a date-of-birth picker on the **complete registration** screen (the screen after OTP when `needsProfileCompletion` / `isRegistered` is false).
2. Block submit when DOB is empty. Local copy: `Date of birth is required.`
3. Send `dateOfBirth` as **`YYYY-MM-DD`** (ISO calendar date). Example: `1990-06-15`.
4. Do not send display formats like `12 Jun 1984` to the API. Convert on the device before the request.
5. Reject future dates on the device. The server also rejects future dates and years before **1900**.
6. Suggested picker bounds (match website): year **1920** through the current year. Server hard floor is **1900**.
7. Once registered, keep DOB editable on the profile screen. Profile update may omit `dateOfBirth` if unchanged; if sent, it must still be a valid ISO date.
8. DOB is used later for product-review age snapshots. The app must not invent age on the review form; that is derived on the server from this profile field.

---

## 3. Auth

Same customer session used after OTP verify:

```http
Authorization: Bearer <customer_session>
```

Or the existing session cookie, if the app already uses that path.

---

## 4. Complete registration (primary path)

```http
POST /auth/complete-registration
Authorization: Bearer <customer_session>
Content-Type: application/json
```

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | Yes | Max 100 |
| `lastName` | string | Yes | Max 100 |
| `email` | string | No | Valid email if sent; max 255 |
| `dateOfBirth` | string | **Yes** | ISO date `YYYY-MM-DD` |

### Example

```json
{
  "firstName": "Asha",
  "lastName": "Rao",
  "email": "asha@example.com",
  "dateOfBirth": "1990-06-15"
}
```

### Success

Typical envelope (same as other auth endpoints):

```json
{
  "success": true,
  "message": "Registration completed successfully",
  "data": {
    "sessionId": "...",
    "isRegistered": true,
    "user": {
      "id": "...",
      "firstName": "Asha",
      "lastName": "Rao",
      "email": "asha@example.com",
      "dateOfBirth": "1990-06-15",
      "isRegistered": true
    },
    "token": "<session_token>"
  }
}
```

`user.dateOfBirth` may arrive as a date string (`YYYY-MM-DD` or full ISO). Treat the calendar day in UTC / date-only form when displaying.

### Errors to handle

| Status | Typical message | App action |
|---|---|---|
| 400 | Date of birth is required. | Show under the DOB field; keep the form open |
| 400 | dateOfBirth must be a valid ISO 8601 date string (e.g. 1990-06-15) | Fix format to `YYYY-MM-DD` |
| 400 | Date of birth cannot be in the future. | Ask the customer to pick a past date |
| 400 | Date of birth is too far in the past. | Year before 1900 |
| 409 | Email is already in use | Show under email |
| 401 | Session missing / unauthorized | Restart OTP / sign-in |

---

## 5. Alternate path: `PATCH /users/profile`

Some clients complete registration with the storefront profile patch instead of `complete-registration`.

```http
PATCH /users/profile
Authorization: Bearer <customer_session>
Content-Type: application/json
```

For a user who is **not yet registered** (`isRegistered: false`), `dateOfBirth` is **required** along with `mobileNumber`, `firstName`, and `lastName`.

```json
{
  "mobileNumber": "9876543210",
  "firstName": "Asha",
  "lastName": "Rao",
  "email": "asha@example.com",
  "dateOfBirth": "1990-06-15"
}
```

For an **already registered** user, `dateOfBirth` is optional. If present, the same validation rules apply.

---

## 6. UI checklist (match website)

- [ ] Registration form includes DOB (required), not only name/email.
- [ ] Date picker opens from the DOB field.
- [ ] Submit disabled or blocked until DOB is chosen.
- [ ] Payload uses `dateOfBirth: "YYYY-MM-DD"`.
- [ ] Server validation errors for DOB are shown next to the DOB field.
- [ ] Profile screen can display and edit DOB for older accounts that still lack it.
- [ ] Review submit form does **not** ask the customer for age; age comes from this DOB later.

---

## 7. Out of scope for this change

- Backfilling DOB for every existing account (they add it from profile when missing).
- Changing product-review create payloads to send age (server-derived).
- Admin customer create flows (separate from shopper registration).

---

## 8. Quick copy for QA

1. New mobile number → OTP → registration screen → leave DOB empty → submit → blocked / 400.
2. Pick a valid past DOB → submit → `isRegistered: true` and profile shows DOB.
3. Pick tomorrow’s date → rejected.
4. Send `dateOfBirth: "15-06-1990"` → rejected; must be `1990-06-15`.
5. Existing registered user opens profile → can update DOB without re-registering.
