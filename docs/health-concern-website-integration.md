# Health Concern — Website / Storefront Integration

Public API fields for health concerns: SEO meta (existing) plus `medicalConditionName` and `patientAudience` (new).

Requires backend deploy + migration `1785983000000-add-health-concern-medical-audience.ts`.

Base path: `/api/v1`

---

## New + confirmed fields

| Field | Type | Nullable | Notes |
|-------|------|----------|--------|
| `metaTitle` | string | yes | SEO title |
| `metaDescription` | string | yes | SEO description |
| `medicalConditionName` | string | yes | Human-readable medical condition label |
| `patientAudience` | `"KIDS"` \| `"ADULTS"` \| `"ALL"` | yes | Who the concern is aimed at |

---

## Where they appear

### 1. Product listing scoped by health concern

When products are loaded with `healthConcernSlug` or `healthConcernRefId`, the response includes a `healthConcern` context object:

```http
GET /api/v1/public/products?healthConcernSlug=hair-fall
```

```json
{
  "data": [ /* products */ ],
  "healthConcern": {
    "refId": "HEA…",
    "name": "Hair Fall",
    "slug": "hair-fall",
    "description": "…",
    "icon": { },
    "banner": { },
    "metaTitle": "Hair Fall Solutions",
    "metaDescription": "…",
    "medicalConditionName": "Androgenetic Alopecia",
    "patientAudience": "ADULTS",
    "faqs": [
      { "question": "…", "answer": "…" }
    ]
  }
}
```

**Use for:** PLP hero, SEO tags (`document.title` / meta description), audience badge, medical condition subtitle.

Same context shape is used when filters resolve a health concern (`contextType=healthConcern`).

---

### 2. View-all health concerns (paginated)

```http
GET /api/v1/public/homepage/health-concerns/view-all?page=1&limit=20
```

Each item includes:

```json
{
  "refId": "HEA…",
  "name": "Hair Fall",
  "slug": "hair-fall",
  "description": "…",
  "icon": { },
  "banner": { },
  "sortIndex": 1,
  "metaTitle": "…",
  "metaDescription": "…",
  "medicalConditionName": "Androgenetic Alopecia",
  "patientAudience": "ADULTS"
}
```

---

### 3. Homepage health-concern strip

```http
GET /api/v1/public/homepage/health-concerns
```

Strip items now also include `metaTitle`, `metaDescription`, `medicalConditionName`, and `patientAudience` (optional on this payload; may be `null`).

Expert-curated bundle **cards** remain compact (`refId`, `name`, `slug`, `description`, `icon` only) — no change required unless you want audience on those cards too.

---

## Suggested frontend usage

| Field | Suggested UI |
|-------|----------------|
| `metaTitle` / `metaDescription` | Next.js `generateMetadata` / `<Helmet>` on HC PLP and HC detail |
| `medicalConditionName` | Subtitle under the concern name when non-null |
| `patientAudience` | Chip/badge: Kids / Adults / All; hide when null |

```ts
type PatientAudience = 'KIDS' | 'ADULTS' | 'ALL';

function audienceLabel(value: PatientAudience | null | undefined): string | null {
  if (!value) return null;
  return { KIDS: 'Kids', ADULTS: 'Adults', ALL: 'All ages' }[value];
}
```

---

## Website checklist

- [ ] Deploy API + run migration
- [ ] On HC PLP, read `response.healthConcern.metaTitle` / `metaDescription` for SEO
- [ ] Show `medicalConditionName` when present
- [ ] Show `patientAudience` badge when present
- [ ] View-all grid can filter/display by `patientAudience` if product wants it
- [ ] Treat all four fields as optional (`null` safe)

---

## Related admin doc

See [health-concern-admin-integration.md](./health-concern-admin-integration.md) for multipart create/update and enum values.
