# Health Concern — Admin Panel Integration

New fields on health concerns, plus confirmation that SEO meta fields are already supported.

Migration: `1785983000000-add-health-concern-medical-audience.ts`  
Run: `npm run migration:run`

---

## Auth

| Item | Value |
|------|--------|
| Base path | `/api/v1/master/health-concerns` |
| Auth | `Authorization: Bearer <admin_jwt>` |
| Create / delete | `SUPER_ADMIN` |
| List / get / update / status / index | `SUPER_ADMIN` or `ADMIN` |

Body is **multipart/form-data** for create and update (icon + banner uploads).

---

## New fields

| Form / JSON field | DB column | Type | Required | Notes |
|-------------------|-----------|------|----------|--------|
| `medicalConditionName` | `medical_condition_name` | string (max 255) | no | Nullable. Empty string clears to `null`. |
| `patientAudience` | `patient_audience` | enum | no | `KIDS` \| `ADULTS` \| `ALL`. Empty string clears to `null`. |

### Already supported (SEO)

| Form / JSON field | DB column | Type | Notes |
|-------------------|-----------|------|--------|
| `metaTitle` | `meta_title` | string (max 255), nullable | Already in create/update + admin responses |
| `metaDescription` | `meta_description` | text, nullable | Already in create/update + admin responses |

No admin UI change needed for meta except ensuring the form still sends/displays them.

---

## Endpoints

| Action | Method | Path |
|--------|--------|------|
| Create | `POST` | `/master/health-concerns` |
| List | `GET` | `/master/health-concerns` |
| Homepage strip (admin) | `GET` | `/master/health-concerns/homepage` |
| Get one | `GET` | `/master/health-concerns/:refId` |
| Update | `PATCH` | `/master/health-concerns/:refId` |
| Status | `PATCH` | `/master/health-concerns/:refId/status` |
| Sort index | `PATCH` | `/master/health-concerns/:refId/index` |
| Delete | `DELETE` | `/master/health-concerns/:refId` |

---

## Create / update form fields

Existing: `name`, `slug`, `description`, `metaTitle`, `metaDescription`, `status`, `inHomePage`, `faqs`, files `icon`, `banner`.

**Add to form:**

- `medicalConditionName` — text input (optional)
- `patientAudience` — select: `KIDS` | `ADULTS` | `ALL` | empty (null)

### Example (multipart)

```http
PATCH /api/v1/master/health-concerns/HEA2026…
Content-Type: multipart/form-data

name=Hair Fall
metaTitle=Hair Fall Solutions
metaDescription=Shop products for hair fall…
medicalConditionName=Androgenetic Alopecia
patientAudience=ADULTS
status=active
inHomePage=true
```

Clear optional fields by sending empty string:

```text
medicalConditionName=
patientAudience=
```

---

## Admin response shape

List, get, create, and update return (among existing fields):

```json
{
  "id": "…",
  "refId": "HEA…",
  "name": "Hair Fall",
  "slug": "hair-fall",
  "description": "…",
  "metaTitle": "Hair Fall Solutions",
  "metaDescription": "…",
  "medicalConditionName": "Androgenetic Alopecia",
  "patientAudience": "ADULTS",
  "icon": { "…": "…" },
  "banner": { "…": "…" },
  "status": "active",
  "inHomePage": true,
  "sortIndex": 1,
  "faqs": []
}
```

`medicalConditionName` / `patientAudience` / `metaTitle` / `metaDescription` may be `null`.

---

## Admin UI checklist

- [ ] Run migration on target env
- [ ] Add `medicalConditionName` text field on create/edit
- [ ] Add `patientAudience` select (`KIDS` / `ADULTS` / `ALL` / none)
- [ ] Confirm `metaTitle` / `metaDescription` inputs exist and bind to API
- [ ] Show all four fields on detail / list columns if product needs them
- [ ] Validate `patientAudience` only allows the three enum values
