# Profile date of birth — Mobile App Integration

Use this guide so the mobile app collects **date of birth (DOB)** the same way the Cureka website does: **on My Profile**, not during registration.

Base path: `/api/v1`.

---

## 1. Product decision

| Surface | DOB |
|---|---|
| Registration after OTP (`POST /auth/complete-registration`) | **Do not collect.** Keep signup to name + email only. |
| My Profile / Edit Profile | **Collect and edit** DOB here (optional). |
| Product review submit | **Do not ask** for age. Server derives age from profile DOB when present. |

Keeping registration short reduces signup friction. DOB is useful later for review age snapshots, but it is not required to create an account.

---

## 2. Registration (unchanged / simple)

```http
POST /auth/complete-registration
Authorization: Bearer <customer_session>
Content-Type: application/json
```

```json
{
  "firstName": "Asha",
  "lastName": "Rao",
  "email": "asha@example.com"
}
```

Do **not** send `dateOfBirth` on this endpoint. The website register modal does not include a DOB field.

---

## 3. Profile — where DOB lives

Use the existing profile update path (same as the website Edit Profile flow).

```http
PATCH /users/profile
Authorization: Bearer <customer_session>
Content-Type: application/json
```

`dateOfBirth` is **optional**. When sent, use ISO calendar date **`YYYY-MM-DD`**.

```json
{
  "mobileNumber": "9876543210",
  "firstName": "Asha",
  "lastName": "Rao",
  "email": "asha@example.com",
  "dateOfBirth": "1990-06-15"
}
```

### Validation (when DOB is sent)

| Rule | Detail |
|---|---|
| Format | `YYYY-MM-DD` (e.g. `1990-06-15`) |
| Future dates | Rejected |
| Year floor | Not before **1900** (website picker starts at **1920**) |
| Empty / omitted | Allowed — leave profile DOB unset |

### Display

Profile responses may include `dateOfBirth` as a date string. Show it on My Profile when present; show empty / placeholder when null.

---

## 4. Reviews and age

- Review create must **not** send `customerAge` or `customerLocation`.
- If the customer has a profile DOB, the server snapshots completed years into `customerAge`.
- If DOB is missing, `customerAge` is stored as `null` (review still succeeds).
- Encourage adding DOB in profile so approved reviews can show “Age · Location” meta.

---

## 5. UI checklist

- [ ] Registration screen: first name, last name, email only — **no DOB**.
- [ ] Profile / Edit Profile: DOB date picker; optional save.
- [ ] Payload uses `dateOfBirth: "YYYY-MM-DD"` when the customer sets it.
- [ ] Review form does not ask for age or location.

---

## 6. QA

1. New user registers without DOB → succeeds; `isRegistered: true`.
2. Profile → set DOB → save → profile returns DOB.
3. Profile → clear/omit DOB on later update (if supported) or leave unchanged.
4. Future date / bad format on profile → 400.
5. Submit a review without DOB → review accepted; age may be null.
