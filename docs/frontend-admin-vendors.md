# Admin Vendors — Frontend Integration Guide

Admin panel: register vendors and list pending/registered vendor applications.

**Base URL:** `/api/v1`  
**Auth:** Admin JWT (`Authorization: Bearer <token>`) + cookie `admin_token` if used  
**Roles:** `SUPER_ADMIN`, `ADMIN`  
**Permissions:** `vendors.create` (register), `vendors.read` (list/view), `vendors.update` (edit)

Suggested routes: `/vendors` (list), `/vendors/create` (register), `/vendors/[refId]` (view/edit).

---

## Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/admin/vendors/product-sample-sheet` | admin role | Download sample product Excel (`.xlsx`) |
| `POST` | `/admin/vendors` | `vendors.create` | Register vendor (multipart) |
| `GET` | `/admin/vendors` | `vendors.read` | Paginated list + search/sort |
| `GET` | `/admin/vendors/:refId` | `vendors.read` | Vendor detail |
| `PATCH` | `/admin/vendors/:refId` | `vendors.update` | Update vendor (multipart or JSON) |

Both public and admin registrations start with `status: PENDING` and `source: ADMIN` (or `PUBLIC` for website).

---

## Download sample product sheet

Place a **Download sample sheet** button next to the product Excel upload on create/edit.

```
GET /api/v1/admin/vendors/product-sample-sheet
Authorization: Bearer <admin token>
```

- **Response:** raw XLSX (`Content-Disposition: attachment`)  
- Filename: `cureka-vendor-product-sample.xlsx`  
- Same content as public sample / product bulk-upload template.

### Frontend (button)

```tsx
const SAMPLE_SHEET_URL = `${API_BASE}/admin/vendors/product-sample-sheet`;

async function downloadSampleSheet(accessToken: string) {
  const res = await fetch(SAMPLE_SHEET_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to download sample sheet');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cureka-vendor-product-sample.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

<button type="button" onClick={() => downloadSampleSheet(token)}>
  Download sample sheet
</button>
```

(Public site can use the unauthenticated URL without `fetch` — see public vendor doc.)

---

## Category & brand pickers (admin)

Reuse the **product wizard bootstrap** API (admin JWT):

| Need | Call |
|------|------|
| Root categories | `GET /api/v1/master/product-wizard/bootstrap?type=category&categoryHierarchyLevel=0` |
| Children of a selected node | `GET /api/v1/master/product-wizard/bootstrap?type=category&parentCategoryRefId={refId}` |
| Brands | `GET /api/v1/master/product-wizard/bootstrap?type=brand&search=&limit=20` |

Optional query params: `status`, `limit`, `cursor`, `search`, `sortBy`, `sortOrder`, `categoryHierarchyLevel` (`0`–`3`), `parentCategoryRefId`.

(Alternatives: `GET /master/categories` / `GET /master/categories/tree` and `GET /master/brands` — wizard bootstrap is preferred for the same cascade UX as Add Product.)

### Cascade selection flow

Admin builds **one or more** category paths (N rows). Each row is a cascade:

```
category  →  sub-category  →  sub-sub-category  →  sub-sub-sub-category
```

1. Load level-0 (main) categories → pick `categoryRefId` (**required**).
2. Load children with `parentCategoryRefId=<selected>` → optional `subCategoryRefId`.
3. Repeat for sub-sub and sub-sub-sub (optional). Stop at any depth after the main category.
4. **Add another path** — same cascade again. Min **1** path; no max beyond UX.

Only **`categoryRefId`** is required per path. Deeper levels are optional.

Submit as `categories[]`. Brands are a separate multi-select from `type=brand`.

---

## 1. Register vendor

```
POST /api/v1/admin/vendors
Content-Type: multipart/form-data
```

Same form fields as the website. Prefer multipart with file fields (do not set Content-Type manually).

### Text fields

| Field | Required | Notes |
|-------|----------|-------|
| `companyName` | Yes | Max 255 |
| `contactPerson` | Yes | Max 255 |
| `email` | Yes | Unique on `users` |
| `mobileNumber` | Yes | 10-digit Indian (`6–9……`) |
| `businessAddress` | Yes | |
| `panNumber` | Yes | `ABCDE1234F` |
| `gstNumber` | Yes | 15-char GSTIN |
| `categories` | Yes | **JSON string** of hierarchy paths (min 1). See cascade flow above. |
| `brandRefIds` | Yes | **JSON string** of active brand `refId`s (min 1). |
| `warehouses` | Yes | **JSON string** of warehouse objects (min 1). |
| `companyProfile` | No | |

### Nested JSON (multipart)

```json
// categories — N paths; only categoryRefId required per path
[
  {
    "categoryRefId": "HEA20260016",
    "subCategoryRefId": "VIT20260001",
    "subSubCategoryRefId": "MUL20260002",
    "subSubSubCategoryRefId": "TAB20260003"
  },
  { "categoryRefId": "BEA20260001" },
  {
    "categoryRefId": "NUT20260010",
    "subCategoryRefId": "PRO20260005"
  }
]

// brandRefIds
["BRA20260001", "BRA20260015"]

// warehouses
[{
  "address": "Warehouse 3, Sanand GIDC",
  "pincode": "382110",
  "contactPerson": "Priya Patel",
  "contactPhone": "9876543214",
  "isDefault": true
}]
```

Warehouse optional fields: `contactPerson`, `contactPhone`, `warehouseCode`, `isDefault`.  
If no `isDefault: true`, the first warehouse is marked default. Contact fields fall back to vendor `contactPerson` / `mobileNumber`.

### File fields

| Field | Required | Notes |
|-------|----------|-------|
| `panDocument` | Yes | JPEG / PNG / WebP / GIF / PDF (per env allow-list) |
| `gstCertificateDocument` | Yes | Same |
| `productExcelSheet` | Yes | **`.xlsx` or `.csv`** (both supported). Contents are **not parsed/validated** — for later product verification. Offer [Download sample sheet](#download-sample-product-sheet). |

Optional admin upload helper (if uploading docs separately first):

```
POST /api/v1/uploads/vendor-documents
```

Register still expects the files on the create form for the primary flow.

### Success

**HTTP 201** — envelope message: `Vendor registered successfully`.  
`data` includes `categories[]`, `brands[]` / `brandRefIds`, `warehouses[]` (with `refId`), signed document URLs, `source: "ADMIN"`, `status: "PENDING"`.

### Errors

| Status | When |
|--------|------|
| `400` | Validation / mime / missing docs / inactive brand |
| `401` / `403` | Missing auth or `vendors.create` |
| `404` | Unknown category or brand `refId` |
| `409` | Email or mobile already exists |

### Example (curl)

```bash
curl --location "http://localhost:3005/api/v1/admin/vendors" \
  --header "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  --form "companyName=Admin Created Vendor Pvt Ltd" \
  --form "contactPerson=Priya Patel" \
  --form "email=priya.vendor@example.com" \
  --form "mobileNumber=9876543214" \
  --form "businessAddress=88 Ring Road, Ahmedabad" \
  --form "panNumber=ABCDE1234F" \
  --form "gstNumber=24ABCDE1234F1Z5" \
  --form 'categories=[{"categoryRefId":"HEA20260016"}]' \
  --form 'brandRefIds=["BRA20260001"]' \
  --form 'warehouses=[{"address":"Warehouse 3, Sanand GIDC","pincode":"382110","isDefault":true}]' \
  --form "panDocument=@./pan.pdf" \
  --form "gstCertificateDocument=@./gst.pdf" \
  --form "productExcelSheet=@./products.xlsx"
```

CSV:

```bash
  --form "productExcelSheet=@./products.csv"
```

---

## 2. List vendors

```
GET /api/v1/admin/vendors?page=1&limit=20&status=PENDING&search=Acme&sortBy=companyName&sortOrder=ASC
```

### Query params

| Param | Default | Notes |
|-------|---------|-------|
| `page` | `1` | 1-based |
| `limit` | `20` | Max 100 |
| `search` | — | Company, contact, email, mobile, refId, GST, PAN, brand name, warehouse address/pincode |
| `status` | — | `PENDING` \| `VERIFIED` \| `ACTIVE` \| `REJECTED` \| `CORRECTION_REQUIRED` |
| `sortBy` | `createdAt` | See columns below |
| `sortOrder` | `DESC` | `ASC` \| `DESC` |

### Sortable columns (`sortBy`)

| Column | Notes |
|--------|-------|
| `createdAt` | Default |
| `updatedAt` | |
| `companyName` | |
| `contactPerson` | |
| `email` | |
| `mobileNumber` | |
| `status` | |
| `source` | `PUBLIC` \| `ADMIN` |
| `gstNumber` | |
| `panNumber` | |
| `refId` | |

### List item (`data[]`)

Same vendor object as register response (nested `categories`, `brands`, `warehouses`), including signed document URLs when storage signing is available.

### Paginated envelope

```json
{
  "success": true,
  "message": "Vendors retrieved successfully",
  "data": {
    "data": [ /* IVendor[] */ ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "timestamp": "…"
}
```

### Example (curl)

```bash
curl --location "http://localhost:3005/api/v1/admin/vendors?page=1&limit=20&status=PENDING&search=Acme&sortBy=createdAt&sortOrder=DESC" \
  --header "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 3. View vendor

```
GET /api/v1/admin/vendors/:refId
```

Permission: `vendors.read`.  
Response: same vendor object as create/list item (with signed document URLs).

```bash
curl --location "http://localhost:3005/api/v1/admin/vendors/VND2026XXXXXX" \
  --header "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 4. Edit vendor

```
PATCH /api/v1/admin/vendors/:refId
```

Permission: `vendors.update`.  
Supports **multipart/form-data** (preferred when replacing files) or JSON.

- All profile fields are **optional** — send only what changed.
- Omit `panDocument` / `gstCertificateDocument` / `productExcelSheet` to **keep existing files**.
- Optional `status` (`PENDING` | `VERIFIED` | `ACTIVE` | `REJECTED` | `CORRECTION_REQUIRED`).
- Changing email/mobile updates the linked `users` row (must stay unique).
- If `categories`, `brandRefIds`, or `warehouses` is sent, that collection is **replace-all** synced (min 1 item when present). Omit the field to keep existing mappings.

### Multipart example

```bash
curl --location --request PATCH "http://localhost:3005/api/v1/admin/vendors/VND2026XXXXXX" \
  --header "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  --form "companyName=Acme Wellness Updated" \
  --form 'warehouses=[{"address":"Plot 45, MIDC, Bhiwandi","pincode":"421302","isDefault":true}]' \
  --form "productExcelSheet=@./products-updated.xlsx"
```

### JSON example (no file change)

```bash
curl --location --request PATCH "http://localhost:3005/api/v1/admin/vendors/VND2026XXXXXX" \
  --header "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data "{
    \"contactPerson\": \"Priya Patel\",
    \"status\": \"PENDING\",
    \"brandRefIds\": [\"BRA20260001\", \"BRA20260015\"],
    \"categories\": [
      { \"categoryRefId\": \"HEA20260016\", \"subCategoryRefId\": \"VIT20260001\" }
    ]
  }"
```

---

## Status & source enums

| Field | Values |
|-------|--------|
| `status` | `PENDING`, `VERIFIED`, `ACTIVE`, `REJECTED`, `CORRECTION_REQUIRED` |
| `source` | `PUBLIC`, `ADMIN` |

Create always starts as `PENDING`. Status can be changed via PATCH. Unicommerce warehouse auto-create is still out of scope.

---

## Admin UI checklist

- [ ] Gate list/view with `vendors.read`, create with `vendors.create`, edit with `vendors.update`
- [ ] List: search box, status filter, sortable columns, pagination
- [ ] Detail page loads `GET /admin/vendors/:refId`
- [ ] Edit form: multipart PATCH; files optional (keep previous if not re-uploaded)
- [ ] Create: multipart form with PAN + GST + product sheet
- [ ] **Download sample sheet** button → `GET /admin/vendors/product-sample-sheet`
- [ ] Category cascade via `GET /master/product-wizard/bootstrap?type=category` — N paths; only main category required
- [ ] Multi-select brands via wizard bootstrap `type=brand` → `brandRefIds[]`
- [ ] Multi warehouses with default flag → `warehouses[]`
- [ ] On edit, sending categories/brands/warehouses replaces the full set
- [ ] Show status badge; do not treat as live/selling until Active + warehouse work
- [ ] Surface `409` for duplicate email/mobile

---

## Related

- Website form: [frontend-public-vendor-registration.md](./frontend-public-vendor-registration.md) (public pickers: `/public/masters`)
- Staff login users (`role=vendor`) remain separate: `/staff-users` — not this module
