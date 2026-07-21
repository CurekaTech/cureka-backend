# Frontend Integration Guide: Product Bulk Import / Export

This document describes how the **Admin UI** should integrate with the product bulk spreadsheet APIs: download template, export existing products, upload for create/update, and poll job progress.

---

## 1. Feature overview

The bulk product workflow supports three spreadsheet actions:

| Action | Endpoint | Purpose |
|--------|----------|---------|
| **Download sample template** | `GET /products/bulk-upload/template/download` | Empty sheet with headers, dropdown reference sheets, and sample rows |
| **Export all products** | `GET /products/bulk-upload/export` | All editable products pre-filled in the **same format** as the sample template |
| **Upload spreadsheet** | `POST /products/bulk-upload` | Create new products or update existing ones (async background job) |

### Recommended admin flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Download        │     │ Edit in Excel    │     │ Upload same     │
│ Template OR     │ ──► │ (add / change    │ ──► │ file via bulk   │
│ Export Products │     │  fields)         │     │ upload API      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                 ┌─────────────────┐
                                                 │ Poll job status │
                                                 │ until complete  │
                                                 └─────────────────┘
```

**Edit & re-upload flow (export):**

1. Admin clicks **Export Products** → downloads `bulk-export-products.xlsx`.
2. Admin edits cells in Excel (pricing, stock, descriptions, etc.).
3. Admin uploads the **same file** via bulk upload — no format changes required.
4. Backend matches existing products by **Product ID (String)**, **SKU**, **Vendor SKU**, or **Product Name + Brand**, then **updates** instead of creating duplicates.

> **Media note:** Image columns contain storage keys (e.g. `images/...`) or public URLs. New images can be added via URL columns or pre-uploaded through the [Media Gallery](./frontend-gallery-integration.md). See §6.

---

## 2. Authentication & access

| Property | Value |
|----------|-------|
| **Base path** | `/api/v1/products/bulk-upload` |
| **Auth** | Admin JWT — `Authorization: Bearer <ADMIN_TOKEN>` |
| **Roles** | `super_admin`, `admin` |

All endpoints in this guide require an authenticated admin token.

---

## 3. API endpoints

### A. Download sample template

Downloads an empty bulk-import spreadsheet with headers, validations reference sheets, and two sample variable-product rows.

| Property | Value |
|----------|-------|
| **Method** | `GET` |
| **Path** | `/api/v1/products/bulk-upload/template/download` |
| **Response** | Binary `.xlsx` file (not JSON) |

**Response headers:**

```http
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="bulk-upload-one-success-latest.xlsx"
```

**cURL:**

```bash
curl -X GET "http://localhost:3005/api/v1/products/bulk-upload/template/download" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  --output bulk-upload-template.xlsx
```

**Frontend handling:**

- Use `responseType: 'blob'` (Axios) or `fetch` + `blob()`.
- Trigger browser download via a temporary `<a download>` link or `URL.createObjectURL`.
- Do **not** expect a JSON wrapper — this endpoint streams the file directly.

---

### B. Export all products (editable re-upload template)

Downloads all non-archived, non-inactive products populated into the **same Excel structure** as the sample template.

| Property | Value |
|----------|-------|
| **Method** | `GET` |
| **Path** | `/api/v1/products/bulk-upload/export` |
| **Response** | Binary `.xlsx` file (not JSON) |

**Response headers:**

```http
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="bulk-export-products.xlsx"
```

**cURL:**

```bash
curl -X GET "http://localhost:3005/api/v1/products/bulk-upload/export" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  --output bulk-export-products.xlsx
```

**What is included in the export:**

- Same sheet name: `Bulk Import Template`
- Same column order and headers as the sample template
- Same hidden reference sheets (Category, Brand, Attribute, Category Filter, Health Concern, Wellness Goal, Product Tag)
- All products except `archived` and `inactive` status
- Human-readable master names (category, brand, health concerns, etc.) — not internal IDs
- `Product ID (String)` populated from `externalProductId` (primary key for update matching)
- Variable products: one row per variant, grouped by `style_group_id`
- Bundle products: parent row + child rows with `Child SKU` / `Child Quantity`

**Frontend handling:**

- Same blob download pattern as template download (§3.A).
- Show a loading spinner — export can take several seconds on large catalogs.
- Disable the button while the request is in flight to prevent duplicate downloads.

**Example (Axios):**

```typescript
async function downloadBulkExport(token: string) {
  const response = await axios.get('/api/v1/products/bulk-upload/export', {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'bulk-export-products.xlsx');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
```

---

### C. Upload spreadsheet

Enqueues an async background job to import or update products from the uploaded file.

| Property | Value |
|----------|-------|
| **Method** | `POST` |
| **Path** | `/api/v1/products/bulk-upload` |
| **Content-Type** | `multipart/form-data` |

**Request fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | `.xlsx` or `.csv` spreadsheet |
| `imagesZip` | File | No | Optional ZIP of image files referenced by filename in the sheet |

**Accepted MIME types for `file`:**

- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (`.xlsx`)
- `text/csv` (`.csv`)

**Success response (201):**

```json
{
  "statusCode": 201,
  "message": "Bulk upload enqueued successfully",
  "data": {
    "refId": "BUP20268571",
    "status": "queued",
    "fileUrl": "bulk-uploads/8ac75d1b-uuid.xlsx",
    "imagesZipUrl": null,
    "createdAt": "2026-07-06T12:00:00.000Z"
  }
}
```

**Error responses:**

| Status | When |
|--------|------|
| `400` | Missing file, invalid file type, or multipart not used |
| `409` | Another bulk upload is already in progress (distributed lock) |

**cURL:**

```bash
curl -X POST "http://localhost:3005/api/v1/products/bulk-upload" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -F "file=@bulk-export-products.xlsx"
```

---

### D. List upload history

| Property | Value |
|----------|-------|
| **Method** | `GET` |
| **Path** | `/api/v1/products/bulk-upload/history?page=1&limit=20` |

Also available at `GET /api/v1/products/bulk-upload` (same response).

**Success response (200):**

```json
{
  "statusCode": 200,
  "message": "Bulk upload history retrieved successfully",
  "data": {
    "data": [
      {
        "refId": "BUP20268571",
        "status": "partial_success",
        "fileUrl": "bulk-uploads/8ac75d1b-uuid.xlsx",
        "imagesZipUrl": null,
        "errorFileUrl": "bulk-uploads/errors/errors-BUP20268571.xlsx",
        "totalRows": 250,
        "processedRows": 250,
        "successfulRows": 240,
        "failedRows": 10,
        "errorSummary": [],
        "createdAt": "2026-07-06T12:00:00.000Z",
        "completedAt": "2026-07-06T12:01:15.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

### E. Get job status & progress

| Property | Value |
|----------|-------|
| **Method** | `GET` |
| **Path** | `/api/v1/products/bulk-upload/:refId` |

> **Route ordering:** `export`, `template/download`, and `history` are static paths. Only use a `refId` value (e.g. `BUP20268571`) for this endpoint — not `export` or `history`.

**Success response (200):**

```json
{
  "statusCode": 200,
  "message": "Bulk upload status retrieved successfully",
  "data": {
    "refId": "BUP20268571",
    "status": "partial_success",
    "progress": {
      "totalRows": 250,
      "processedRows": 250,
      "successfulRows": 240,
      "failedRows": 10,
      "percentage": 100
    },
    "uploadSummary": {
      "productsCreated": 5,
      "productsUpdated": 235,
      "variantsCreated": 12,
      "variantsUpdated": 480
    },
    "errorFileUrl": "bulk-uploads/errors/errors-BUP20268571.xlsx",
    "errorSummary": [
      {
        "rowNumber": 12,
        "sku": "WP002",
        "column": "Selling Price (Rs)*",
        "invalidValue": "1500",
        "reason": "Selling price cannot exceed the product MRP.",
        "suggestedFix": "Lower the selling price or adjust the MRP."
      }
    ],
    "createdAt": "2026-07-06T12:00:00.000Z",
    "completedAt": "2026-07-06T12:01:15.000Z"
  }
}
```

**Job status values:**

| Status | Meaning | UI action |
|--------|---------|-----------|
| `pending` | Job created | Show spinner, poll |
| `queued` | Waiting in queue | Show spinner, poll |
| `validating` | Parsing & validating sheet | Show spinner, poll |
| `processing` | Creating/updating products | Show progress bar, poll |
| `completed` | All rows succeeded | Show success summary |
| `partial_success` | Some rows failed | Show summary + error table |
| `failed` | Job failed entirely | Show error message |

**Polling recommendation:** every **2 seconds** while status is `pending`, `queued`, `validating`, or `processing`. Stop when status is terminal (`completed`, `partial_success`, `failed`).

---

## 4. UI layout recommendations

### Bulk import page sections

```
┌──────────────────────────────────────────────────────────────┐
│  Product Bulk Import                                         │
├──────────────────────────────────────────────────────────────┤
│  [ Download Sample Template ]   [ Export All Products ]      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Drop .xlsx / .csv here or click to browse             │  │
│  │  Max file size: 40 MB                                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Upload History table (paginated)                            │
└──────────────────────────────────────────────────────────────┘
```

### Button copy

| Button | Action |
|--------|--------|
| **Download Sample Template** | `GET .../template/download` — for new product creation |
| **Export All Products** | `GET .../export` — download existing catalog for editing |
| **Upload** | `POST .../bulk-upload` — submit edited file |

### Progress screen (after upload)

- Transition to a progress card when upload returns `201`.
- Progress bar bound to `progress.percentage`.
- Show `processedRows / totalRows` and `successfulRows` / `failedRows` counts.
- On `partial_success` or `failed`, render `errorSummary` in a table:

| Row | SKU | Column | Invalid Value | Reason | Suggested Fix |
|-----|-----|--------|---------------|--------|---------------|
| 12 | WP002 | Selling Price (Rs)* | 1500 | Cannot exceed MRP | Lower selling price |

- If `errorFileUrl` is present, offer a **Download Error Report** link (signed URL from storage).

---

## 5. Update vs create behaviour

When the uploaded sheet is processed, the backend resolves each product group to an existing record using (in order of signals):

1. **Product ID (String)** — matches `externalProductId` in the database (exported in the `Product ID (String)` column).
2. **Vendor SKU**
3. **Product SKU Code** — matches variant SKU.
4. **Product Name + Brand** — combined lookup.

| Scenario | Backend behaviour |
|----------|-------------------|
| Match found | **Update** existing product; only fields present in the sheet are applied |
| No match | **Create** new product |
| Image columns empty on update | Existing product media is **preserved** (not cleared) |
| Image columns present on update | Media is **replaced** with sheet values |

**UI guidance for admins:**

- After export, do not delete the `Product ID (String)` or `Product SKU Code*` columns — they are required for correct update matching.
- For variable products, keep `style_group_id` consistent across variant rows of the same product.
- Unmodified rows can be left as-is; they will update with the same values (no unintended data loss for omitted image columns).

---

## 6. Spreadsheet format notes

### Main sheet

- **Sheet name:** `Bulk Import Template`
- **Header row:** Row 1 (frozen with sample rows in template only; export has header + data rows)
- **Product types:** `simple`, `variable`, `bundle`

### Reference sheets (read-only for admins)

These sheets are included for Excel dropdowns and reference. Do not delete them when re-uploading:

- Category Reference
- Brand Reference
- Attribute Reference
- Category Filter Reference
- Health Concern Reference
- Wellness Goal Reference
- Product Tag Reference

### Key columns for matching & identity

| Column | Purpose |
|--------|---------|
| `Product ID (String)` | External product ID — primary update key |
| `Product SKU Code*` | Variant SKU — secondary update key |
| `style_group_id` | Groups variable-product variant rows |
| `Product Type *` | `simple` / `variable` / `bundle` |
| `Product Status` | e.g. `published`, `draft` |

### Media columns

| Product type | Image columns used |
|--------------|-------------------|
| Simple | `Primary Image URL`, `Gallery Image 2 URL`, … |
| Variable | `common_media_1_url`, `common_media_2_url`, … (product-level shared media) |
| Per-variant images | Variant row gallery columns when applicable |

Exported image values are **storage keys** (e.g. `images/products/abc.jpg`). The upload API accepts storage keys or public `https://` URLs.

---

## 7. Error handling checklist

| Scenario | HTTP | UI message |
|----------|------|------------|
| No auth token | `401` | Redirect to login |
| Wrong role | `403` | "You don't have permission" |
| Upload in progress | `409` | "Another bulk upload is running. Please wait." |
| Invalid file type | `400` | "Only .xlsx and .csv files are allowed" |
| File too large | `400` / client reject | "File exceeds maximum size" |
| Export timeout | Network error | "Export failed. Please try again." |
| Job not found | `404` | "Upload job not found" |

---

## 8. TypeScript types (reference)

```typescript
type BulkUploadStatus =
  | 'pending'
  | 'queued'
  | 'validating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'partial_success';

interface BulkUploadJob {
  refId: string;
  status: BulkUploadStatus;
  fileUrl: string;
  imagesZipUrl: string | null;
  createdAt: string;
}

interface BulkUploadProgress {
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  percentage: number;
}

interface BulkUploadError {
  rowNumber: number;
  sku: string;
  column: string;
  invalidValue: string;
  reason: string;
  suggestedFix: string;
}

interface BulkUploadStatusResponse {
  refId: string;
  status: BulkUploadStatus;
  progress: BulkUploadProgress;
  uploadSummary?: {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
  };
  errorFileUrl: string | null;
  errorSummary: BulkUploadError[];
  createdAt: string;
  completedAt: string | null;
}
```

---

## 9. Related docs

- [Media Gallery integration](./frontend-gallery-integration.md) — pre-upload images referenced by filename in the sheet
- [Product wizard / master data](./frontend-product-wizard-master-integration.md) — categories, brands, attributes used in sheet columns
