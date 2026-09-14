# Bulk Price Update - Admin API

Async SKU price bulk-update for the admin panel. Upload an Excel/CSV sheet, queue a background job, then poll history/status.

Migration: `1785980700000-add-bulk-upload-type.ts`  
Run: `npm run migration:run`

Related menu change: **Bulk Upload** is now a dropdown with Product Upload + Price Update.

---

## Menu / nav

From admin menu API (`getMenuForUser`), under Products:

| Label | Key | Href | Permission |
|------|-----|------|------------|
| Bulk Upload (parent) | `products-bulk-upload` | — (has `subItems`) | — |
| Product Upload | `products-bulk-upload-products` | `/products/bulk-upload/history` | `products.create` |
| Price Update | `products-bulk-price-update` | `/products/bulk-price-update/history` | `products.update` |

Render recursive `subItems` the same way as Product List / Bundle Products.

---

## Auth

- Header: `Authorization: Bearer <admin_jwt>`
- Roles: `SUPER_ADMIN`, `ADMIN`
- Base path: `/api/v1`

| Endpoint | Permission |
|----------|------------|
| `POST /products/bulk-price-update` | `products.update` |
| `POST /products/bulk-price-update/:refId/cancel` | `products.update` |
| `GET /products/bulk-price-update/template/download` | `products.read` |
| `GET /products/bulk-price-update/history` | `products.read` |
| `GET /products/bulk-price-update/:refId` | `products.read` |

---

## Sheet contract

| Header | Required | Maps to |
|--------|----------|---------|
| `SKU` | yes | `product_variants.sku` |
| `Product Id` | no | `product_variants.external_product_id` |
| `MRP` | yes | `product_variants.mrp` |
| `Selling Price` | yes | `product_variants.selling_price` |

### Aliases accepted

- Product Id: `Product ID`, `Product ID (String)`, `external product id`, `ID`
- MRP: `MRP (Rs)`, `MRP (Rs)*`, `Regular Price`
- Selling Price: `Selling Price (Rs)`, `Selling Price (Rs)*`, `Sale Price`

### Validation

- SKU required; unmatched SKU → row error (no product create)
- If Product Id is present, it must match the variant found by SKU → otherwise row error
- MRP and Selling Price required, both `> 0`
- Selling Price must be `<=` MRP
- Duplicate SKUs in the same sheet → fail those rows
- On success, `discountPercentage` is recomputed as `((MRP - Selling Price) / MRP) * 100`

Accepted files: `.xlsx`, `.csv`

---

## APIs

### 1. Download template

```http
GET /api/v1/products/bulk-price-update/template/download
```

Returns XLSX attachment `bulk-price-update-template.xlsx` with headers + one sample row.

### 2. Upload + enqueue

```http
POST /api/v1/products/bulk-price-update
Content-Type: multipart/form-data
```

Field name: **`file`**

**Response `data` example:**

```json
{
  "refId": "BPU2026XXXX",
  "status": "queued",
  "uploadType": "PRICE_UPDATE",
  "fileUrl": "bulk-price-updates/....xlsx",
  "createdAt": "2026-09-10T09:00:00.000Z"
}
```

Only one price-update job runs at a time (separate lock from product bulk upload).

### 3. History

```http
GET /api/v1/products/bulk-price-update/history?page=1&limit=20
```

Returns only `uploadType = PRICE_UPDATE` jobs.

```json
{
  "data": [
    {
      "refId": "BPU2026XXXX",
      "status": "partial_success",
      "uploadType": "PRICE_UPDATE",
      "fileUrl": "...",
      "errorFileUrl": null,
      "errorSummary": [],
      "totalRows": 100,
      "processedRows": 100,
      "successfulRows": 95,
      "failedRows": 5,
      "createdAt": "...",
      "completedAt": "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Statuses: `pending` | `validating` | `queued` | `processing` | `completed` | `failed` | `partial_success`

### 4. Job status

```http
GET /api/v1/products/bulk-price-update/:refId
```

```json
{
  "refId": "BPU2026XXXX",
  "status": "completed",
  "uploadType": "PRICE_UPDATE",
  "progress": {
    "totalRows": 100,
    "processedRows": 100,
    "successfulRows": 100,
    "failedRows": 0,
    "percentage": 100
  },
  "errorFileUrl": null,
  "errorSummary": [],
  "createdAt": "...",
  "completedAt": "..."
}
```

**`errorSummary` item:**

```json
{
  "rowNumber": 12,
  "sku": "ETH/HYD/54141-A1",
  "column": "Product Id",
  "invalidValue": "99999",
  "reason": "Product Id does not match SKU (variant has \"54141\")",
  "suggestedFix": "Provide the Product Id that belongs to this SKU, or leave it blank"
}
```

### 5. Cancel

```http
POST /api/v1/products/bulk-price-update/:refId/cancel
```

Marks the job failed as cancelled and removes queued BullMQ jobs when possible.

---

## Suggested admin UI flow

1. **History page** (`/products/bulk-price-update/history`)
   - Table of past jobs (status, counts, dates)
   - CTA: “Upload price sheet” / “Download template”
2. **Upload**
   - Download template → fill SKU / optional Product Id / MRP / Selling Price
   - Multipart upload `file`
   - On success, navigate to status for returned `refId` (or stay on history and poll)
3. **Status**
   - Poll `GET /:refId` every few seconds while status is `queued` / `validating` / `processing`
   - Show progress bar from `progress.percentage`
   - On terminal status, show success/fail counts + `errorSummary` table

Mirror the existing Product Upload UX; only the columns and endpoints differ.

---

## curl examples

```bash
# Template
curl -L -H "Authorization: Bearer $TOKEN" \
  -o bulk-price-update-template.xlsx \
  "http://localhost:3000/api/v1/products/bulk-price-update/template/download"

# Upload
curl -H "Authorization: Bearer $TOKEN" \
  -F "file=@./prices.xlsx" \
  "http://localhost:3000/api/v1/products/bulk-price-update"

# History
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/products/bulk-price-update/history?page=1&limit=20"

# Status
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/products/bulk-price-update/BPU2026XXXX"
```

---

## Notes

- Product bulk upload history remains at `/products/bulk-upload/*` and is filtered to `uploadType = PRODUCT`.
- Price update does not create products; it only updates existing variants.
- Worker flag (optional): `BULK_PRICE_UPDATE_PROCESSOR_ENABLED=true` (default true).
