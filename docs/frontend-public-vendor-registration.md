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
| `POST` | `/public/vendors/register` | Submit vendor onboarding form + KYC docs |

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
| `warehouseAddress` | Yes | Pickup address (future Unicommerce warehouse) |
| `warehousePincode` | Yes | |
| `warehouseContactPerson` | No | Defaults to `contactPerson` |
| `warehouseContactPhone` | No | Defaults to `mobileNumber` |
| `panNumber` | Yes | Format `ABCDE1234F` |
| `gstNumber` | Yes | 15-char GSTIN; middle 10 chars should match PAN |
| `productCategories` | No | Free text |
| `brandDetails` | No | Free text |
| `companyProfile` | No | Free text |

### File fields

| Field | Required | Allowed types |
|-------|----------|---------------|
| `panDocument` | Yes | Per `UPLOAD_ALLOWED_MIME_TYPES` (typically JPEG, PNG, WebP, GIF, PDF) |
| `gstCertificateDocument` | Yes | Same as above |
| `productExcelSheet` | Yes | **`.xlsx` or `.csv` only** (browser MIME aliases accepted). Sheet **contents are not validated** — file is stored for later manual product review. |

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
    "warehouseAddress": "…",
    "warehousePincode": "421302",
    "warehouseContactPerson": "Rahul Sharma",
    "warehouseContactPhone": "9876543210",
    "panNumber": "ABCDE1234F",
    "panDocument": { "key": "…", "name": "…", "url": "https://…" },
    "gstNumber": "27ABCDE1234F1Z5",
    "gstCertificateDocument": { "key": "…", "name": "…", "url": "https://…" },
    "productExcelSheet": { "key": "…", "name": "…", "url": "https://…" },
    "productCategories": "Vitamins, Supplements",
    "brandDetails": "Acme Nutrition",
    "companyProfile": "…",
    "status": "PENDING",
    "source": "PUBLIC",
    "warehouseCode": null,
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
4. Max file size follows storage config (same as other uploads).

---

## Common errors

| Status | When |
|--------|------|
| `400` | Validation / unsupported mime / missing documents |
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
  --form "warehouseAddress=Plot 45, MIDC, Bhiwandi" \
  --form "warehousePincode=421302" \
  --form "panNumber=ABCDE1234F" \
  --form "gstNumber=27ABCDE1234F1Z5" \
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
