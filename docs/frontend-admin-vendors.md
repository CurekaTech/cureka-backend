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
| `POST` | `/admin/vendors` | `vendors.create` | Register vendor (multipart) |
| `GET` | `/admin/vendors` | `vendors.read` | Paginated list + search/sort |
| `GET` | `/admin/vendors/:refId` | `vendors.read` | Vendor detail |
| `PATCH` | `/admin/vendors/:refId` | `vendors.update` | Update vendor (multipart or JSON) |

Both public and admin registrations start with `status: PENDING` and `source: ADMIN` (or `PUBLIC` for website).

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
| `warehouseAddress` | Yes | Pickup / warehouse |
| `warehousePincode` | Yes | |
| `warehouseContactPerson` | No | Defaults to `contactPerson` |
| `warehouseContactPhone` | No | Defaults to `mobileNumber` |
| `panNumber` | Yes | `ABCDE1234F` |
| `gstNumber` | Yes | 15-char GSTIN |
| `productCategories` | No | |
| `brandDetails` | No | |
| `companyProfile` | No | |

### File fields

| Field | Required | Notes |
|-------|----------|-------|
| `panDocument` | Yes | JPEG / PNG / WebP / GIF / PDF (per env allow-list) |
| `gstCertificateDocument` | Yes | Same |
| `productExcelSheet` | Yes | **`.xlsx` or `.csv`** (both supported). Contents are **not parsed/validated** — for later product verification |

Optional admin upload helper (if uploading docs separately first):

```
POST /api/v1/uploads/vendor-documents
```

Register still expects the files on the create form for the primary flow.

### Success

**HTTP 201** — envelope message: `Vendor registered successfully`.  
`data` shape matches the public registration response, with `source: "ADMIN"` and `status: "PENDING"`.

### Errors

| Status | When |
|--------|------|
| `400` | Validation / mime / missing docs |
| `401` / `403` | Missing auth or `vendors.create` |
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
  --form "warehouseAddress=Warehouse 3, Sanand GIDC" \
  --form "warehousePincode=382110" \
  --form "panNumber=ABCDE1234F" \
  --form "gstNumber=24ABCDE1234F1Z5" \
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
| `search` | — | Company, contact, email, mobile, refId, GST, PAN, pincode, addresses, brand |
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
| `warehousePincode` | |
| `refId` | |

### List item (`data[]`)

Same vendor object as register response, including signed `panDocument.url` / `gstCertificateDocument.url` / `productExcelSheet.url` when storage signing is available.

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

### Multipart example

```bash
curl --location --request PATCH "http://localhost:3005/api/v1/admin/vendors/VND2026XXXXXX" \
  --header "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  --form "companyName=Acme Wellness Updated" \
  --form "warehousePincode=421302" \
  --form "productExcelSheet=@./products-updated.xlsx"
```

### JSON example (no file change)

```bash
curl --location --request PATCH "http://localhost:3005/api/v1/admin/vendors/VND2026XXXXXX" \
  --header "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data "{
    \"contactPerson\": \"Priya Patel\",
    \"status\": \"PENDING\"
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
- [ ] Show status badge; do not treat as live/selling until Active + warehouse work
- [ ] Surface `409` for duplicate email/mobile

---

## Related

- Website form: [frontend-public-vendor-registration.md](./frontend-public-vendor-registration.md)
- Staff login users (`role=vendor`) remain separate: `/staff-users` — not this module
