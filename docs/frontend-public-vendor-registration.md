# Public Vendor Registration — Website Integration Guide

Self-serve vendor onboarding from the Cureka website.

**Base URL:** `/api/v1`  
**Auth:** None (public)  
**Content-Type:** `multipart/form-data` (required for document uploads)

After submit, the vendor is stored as `PENDING`. No vendor login in this slice.

---

## Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/public/vendors/product-sample-sheet` | Download sample product Excel (`.xlsx`) |
| `POST` | `/public/vendors/register` | Submit vendor onboarding form + KYC docs |

---

## Download sample product sheet

Place a **Download sample sheet** button next to the product Excel upload field.

```
GET /api/v1/public/vendors/product-sample-sheet
```

- **Auth:** none  
- **Response:** raw XLSX file (`Content-Disposition: attachment`)  
- Filename: `cureka-vendor-product-sample.xlsx`  
- Same template shape as admin product bulk upload (headers + sample rows).

### Frontend (button)

```tsx
const SAMPLE_SHEET_URL = `${API_BASE}/public/vendors/product-sample-sheet`;

<button type="button" onClick={() => { window.location.href = SAMPLE_SHEET_URL; }}>
  Download sample sheet
</button>

// or:
<a href={SAMPLE_SHEET_URL} download>
  Download sample sheet
</a>
```

Do **not** expect a JSON envelope — the response is the file bytes.

---

## Category & brand pickers (public)

Use the public masters API (no auth):

| Need | Call |
|------|------|
| Root categories | `GET /api/v1/public/masters?type=category&categoryHierarchyLevel=0` |
| Children of a selected node | `GET /api/v1/public/masters?type=category&parentCategoryRefId={refId}` |
| Brands | `GET /api/v1/public/masters?type=brand&search=&page=1&limit=20` |

Optional query params on masters: `page`, `limit`, `search`, `sortBy`, `sortOrder`, `categoryHierarchyLevel` (`0`–`3`), `parentCategoryRefId`, `slug`.

### Cascade selection flow

User builds **one or more** category paths (N rows). Each row is a cascade:

```
category  →  sub-category  →  sub-sub-category  →  sub-sub-sub-category
```

1. Load level-0 (main) categories → user picks `categoryRefId` (**required**).
2. Load children with `parentCategoryRefId=<selected>` → optional `subCategoryRefId`.
3. Repeat for sub-sub and sub-sub-sub (optional). User may stop at any depth after the main category.
4. **Add another path** — same cascade again. Min **1** path; no max beyond UX.

Only **`categoryRefId`** is required per path. Deeper levels are optional.

Submit as `categories[]` (see below). Brands are a separate multi-select from `type=brand`.

---

## Request (form-data)

Send fields as **multipart form-data**. Do not set `Content-Type` manually in the browser/Postman — the client must include the boundary.

### Text fields

| Field | Required | Notes |
|-------|----------|-------|
| `companyName` | Yes | Max 255 |
| `contactPerson` | Yes | Max 255; also used to seed the linked user name |
| `email` | Yes | Unique across `users` |
| `mobileNumber` | Yes | 10-digit Indian mobile (`6–9……`) |
| `businessAddress` | Yes | |
| `panNumber` | Yes | Format `ABCDE1234F` |
| `gstNumber` | Yes | 15-char GSTIN; middle 10 chars should match PAN |
| `categories` | Yes | **JSON string** of category path objects (min 1). See below. |
| `brandRefIds` | Yes | **JSON string** of brand master `refId`s (min 1). |
| `warehouses` | Yes | **JSON string** of warehouse objects (min 1). See below. |
| `companyProfile` | No | Free text |

### Nested JSON fields (multipart)

Because multipart is flat, send arrays as **JSON-encoded strings**:

#### `categories`

```json
[
  {
    "categoryRefId": "HEA20260016",
    "subCategoryRefId": "VIT20260001",
    "subSubCategoryRefId": "MUL20260002",
    "subSubSubCategoryRefId": "TAB20260003"
  },
  {
    "categoryRefId": "BEA20260001"
  },
  {
    "categoryRefId": "NUT20260010",
    "subCategoryRefId": "PRO20260005",
    "subSubCategoryRefId": "WHE20260008"
  }
]
```

- Min **1** path; each path needs at least `categoryRefId`.
- Omit deeper keys (or send `null`) when the user did not pick that level.
- Load options via `GET /public/masters?type=category` as in the cascade flow above.

#### `brandRefIds`

```json
["BRA20260001", "BRA20260015"]
```

- Brands must exist and be **active**.
- Load from `GET /api/v1/public/masters?type=brand`.

#### `warehouses`

```json
[
  {
    "address": "Plot 45, MIDC, Bhiwandi",
    "pincode": "421302",
    "contactPerson": "Rahul Sharma",
    "contactPhone": "9876543210",
    "warehouseCode": null,
    "isDefault": true
  }
]
```

| Field | Required | Notes |
|-------|----------|-------|
| `address` | Yes | Warehouse / pickup address |
| `pincode` | Yes | |
| `contactPerson` | No | Defaults to vendor `contactPerson` |
| `contactPhone` | No | Defaults to vendor `mobileNumber` |
| `warehouseCode` | No | Reserved for future Unicommerce |
| `isDefault` | No | If none set, the first warehouse becomes default |

### File fields

| Field | Required | Allowed types |
|-------|----------|---------------|
| `panDocument` | Yes | Per `UPLOAD_ALLOWED_MIME_TYPES` (typically JPEG, PNG, WebP, GIF, PDF) |
| `gstCertificateDocument` | Yes | Same as above |
| `productExcelSheet` | Yes | **`.xlsx` or `.csv` only** (browser MIME aliases accepted). Sheet **contents are not validated** — file is stored for later manual product review. Offer [Download sample sheet](#download-sample-product-sheet) so vendors fill the expected columns. |

BMP may be rejected if not listed in env `UPLOAD_ALLOWED_MIME_TYPES` — prefer JPEG/PNG/PDF.

---

## Success response

**HTTP 201**

```json
{
  "success": true,
  "message": "Vendor registration submitted successfully",
  "data": {
    "id": "uuid",
    "refId": "VND2026……",
    "userId": "uuid",
    "userRefId": "VEN2026……",
    "companyName": "Acme Wellness Pvt Ltd",
    "contactPerson": "Rahul Sharma",
    "email": "rahul.vendor@example.com",
    "mobileNumber": "9876543210",
    "businessAddress": "…",
    "panNumber": "ABCDE1234F",
    "panDocument": { "key": "…", "name": "…", "url": "https://…" },
    "gstNumber": "27ABCDE1234F1Z5",
    "gstCertificateDocument": { "key": "…", "name": "…", "url": "https://…" },
    "productExcelSheet": { "key": "…", "name": "…", "url": "https://…" },
    "companyProfile": "…",
    "categories": [
      {
        "sortOrder": 0,
        "categoryRefId": "HEA20260016",
        "categoryName": "Health",
        "subCategoryRefId": "VIT20260001",
        "subCategoryName": "Vitamins",
        "subSubCategoryRefId": null,
        "subSubCategoryName": null,
        "subSubSubCategoryRefId": null,
        "subSubSubCategoryName": null
      }
    ],
    "brands": [{ "id": "uuid", "refId": "BRA20260001", "name": "Acme Nutrition" }],
    "brandRefIds": ["BRA20260001"],
    "warehouses": [
      {
        "id": "uuid",
        "refId": "VWH……",
        "address": "Plot 45, MIDC, Bhiwandi",
        "pincode": "421302",
        "contactPerson": "Rahul Sharma",
        "contactPhone": "9876543210",
        "warehouseCode": null,
        "isDefault": true
      }
    ],
    "status": "PENDING",
    "source": "PUBLIC",
    "createdAt": "…",
    "updatedAt": "…"
  },
  "timestamp": "…"
}
```

---

## UI notes

1. Show a confirmation that the application was received and is **under review** (`PENDING`).
2. Email and mobile must be unique — show conflict errors clearly.
3. Validate PAN / GSTIN client-side before upload when possible.
4. Categories: cascade pickers via `GET /public/masters?type=category` — allow **N** paths; only main category required per path.
5. Brands: multi-select via `GET /public/masters?type=brand`.
6. Support multiple warehouses; mark one as default.
7. Offer **Download sample sheet** → `GET /public/vendors/product-sample-sheet` next to the product Excel upload.
8. Max file size follows storage config (same as other uploads).

---

## Common errors

| Status | When |
|--------|------|
| `400` | Validation / unsupported mime / missing documents / inactive brand |
| `404` | Unknown category or brand `refId` |
| `409` | Email or mobile already registered |

---

## Example (curl)

```bash
curl --location "http://localhost:3005/api/v1/public/vendors/register" \
  --form "companyName=Acme Wellness Pvt Ltd" \
  --form "contactPerson=Rahul Sharma" \
  --form "email=rahul.vendor@example.com" \
  --form "mobileNumber=9876543210" \
  --form "businessAddress=12 MG Road, Mumbai" \
  --form "panNumber=ABCDE1234F" \
  --form "gstNumber=27ABCDE1234F1Z5" \
  --form 'categories=[{"categoryRefId":"HEA20260016","subCategoryRefId":"VIT20260001"}]' \
  --form 'brandRefIds=["BRA20260001"]' \
  --form 'warehouses=[{"address":"Plot 45, MIDC, Bhiwandi","pincode":"421302","isDefault":true}]' \
  --form "panDocument=@./pan.pdf" \
  --form "gstCertificateDocument=@./gst.pdf" \
  --form "productExcelSheet=@./products.xlsx"
```

CSV works the same way:

```bash
  --form "productExcelSheet=@./products.csv"
```

---

## Out of scope (this slice)

- Vendor login / portal
- Field-level verification workflow
- Correction / resubmit loop
- Unicommerce warehouse creation
