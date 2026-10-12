# COD and Return & Replacement Update — Admin API

Two async bulk jobs for the admin panel. Each one uploads an Excel/CSV sheet, queues a background job, and is polled the same way as price update.

Migration: `1785999000000-add-bulk-upload-type-cod-and-return-update.ts`  
Run: `npm run migration:run`

The admin React app is not in this repo. Add the two menu links below; the APIs are ready for those pages.

---

## Menu / nav

From the admin menu API (`getMenuForUser`), under Products → Bulk Upload:

| Label | Key | Href | Permission |
|------|-----|------|------------|
| COD Update | `products-bulk-cod-update` | `/products/bulk-cod-update/history` | `products.update` |
| Return & Replacement Update | `products-bulk-return-update` | `/products/bulk-return-update/history` | `products.update` |

Render `subItems` the same way as Product Upload and Price Update.

---

## Auth

- Header: `Authorization: Bearer <admin_jwt>`
- Roles: `SUPER_ADMIN`, `ADMIN`
- Base path: `/api/v1`

| Endpoint | Permission |
|----------|------------|
| `POST /products/bulk-cod-update` | `products.update` |
| `POST /products/bulk-cod-update/:refId/cancel` | `products.update` |
| `GET /products/bulk-cod-update/template/download` | `products.read` |
| `GET /products/bulk-cod-update/history` | `products.read` |
| `GET /products/bulk-cod-update/:refId` | `products.read` |
| `POST /products/bulk-return-update` | `products.update` |
| `POST /products/bulk-return-update/:refId/cancel` | `products.update` |
| `GET /products/bulk-return-update/template/download` | `products.read` |
| `GET /products/bulk-return-update/history` | `products.read` |
| `GET /products/bulk-return-update/:refId` | `products.read` |

Upload field name is `file`. Accepted types: `.xlsx` and `.csv`.

---

## SKU matching

Both jobs match `product_variants.sku` with exact equality after trimming the spreadsheet cell only.

- `HER/ZIN/08945` matches only that string.
- `her/zin/08945` is a different SKU.
- The database value is not trimmed, lowercased, or searched with `ILIKE`.
- Soft-deleted variants are ignored.
- No row creates a product or a variant.
- Zero matches: the row fails as not found.
- More than one non-deleted variant with that SKU: the row fails as ambiguous, and nothing is updated.
- Identical duplicate rows for one SKU are applied once.
- Rows that ask for different values for the same SKU are all rejected.

---

## Booleans

`codAvailable`, `returnAllowed`, `replaceAllowed`, and `refundAllowed` accept `true`, `false`, `yes`, and `no`, compared without case sensitivity.

Any other value fails the row. It is not stored as `false`.

---

## COD Update

Sheet headers: `SKU`, `codAvailable`.

Sample:

| SKU | codAvailable |
|-----|--------------|
| HER/ZIN/08945 | true |
| HER/ZIN/08946 | false |

Each successful row sets `product_variants.cod_available`. A variant that already has that value is counted as already compliant and is not written again.

`products.cod_available` is updated only when every non-deleted variant of that product was successfully included and they all requested the same value. Unmatched, ambiguous, invalid, and failed rows do not count toward that check.

- Some variants missing from the sheet: variants that matched are updated, and the product flag is left unchanged. The job counts this as skipped for partial coverage.
- Every variant included, but the requested values differ: each variant is updated, and the product flag is left unchanged. The job counts this as skipped for a COD conflict.

No other product column is written.

---

## Return & Replacement Update

Sheet headers:

`SKU`, `returnAllowed`, `returnPolicy`, `returnWindowDays`, `replaceAllowed`, `replaceWindowDays`, `refundAllowed`

`returnAllowed`, `replaceAllowed`, and `refundAllowed` are required. Policy and both windows may be empty.

Sample:

| SKU | returnAllowed | returnPolicy | returnWindowDays | replaceAllowed | replaceWindowDays | refundAllowed |
|-----|---------------|--------------|------------------|----------------|-------------------|---------------|
| HER/ZIN/08945 | true | 7 day return | 7 | true | 7 | true |
| HER/ZIN/08946 | false | | | false | | false |

Windows must be empty or a non-negative integer. `7.5` and `-1` fail the row.

These fields live on the parent product, including a bundle. The bundle SKU is the variant on the bundle product itself. Child products in `product_bundles` are not updated.

Before any write, rows are grouped by SKU and then by parent product.

- Identical duplicates are applied once.
- Different values for the same SKU are rejected.
- If several SKUs of one product request different return, replacement, or refund values, every conflicting row for that product is rejected and that product is not written.

For each remaining product the job writes these fields once:

`return_allowed`, `return_policy`, `return_window_days`, `replace_allowed`, `replace_window_days`, `refund_allowed`

The same values are written onto each matched variant so order eligibility stays consistent. Sibling variants that were not in the sheet are not updated.

When `returnAllowed` is false, policy and return window are stored as null. When it is true, policy and window may stay empty. When `replaceAllowed` is false, the replacement window is stored as null.

---

## Job summary

History and status return `summary` separately from row errors. `errorSummary` contains only row errors. `summary` is also stored on the job.

| Field | Meaning |
|-------|---------|
| `variantsUpdated` | Variant rows whose write changed the database |
| `productCodFlagsUpdated` | Parent products whose `cod_available` was changed |
| `productReturnRecordsUpdated` | Parent products whose return/replacement fields were changed |
| `variantsAlreadyCompliant` | Matched variants that already had the requested values |
| `productsSkippedPartialCodCoverage` | Products left unchanged because at least one variant was not in the sheet |
| `productsSkippedConflictingCodValues` | Products left unchanged because included variants requested different COD values |
| `conflictingReturnRowsRejected` | Return/replacement rows rejected because one product had conflicting values |
| `databaseFailures` | Writes that did not change a row, or threw |
| `cacheInvalidationFailures` | Number of product ref ids whose cache clear failed |
| `cacheFailureProductRefIds` | Those product ref ids |
| `identicalDuplicateRows` | Extra identical rows collapsed before writing |

`successfulRows` is `variantsUpdated` plus the product records that actually changed. Unchanged rows are not failures. `failedRows` is the number of row errors. When there are failed rows, the job also sets `errorFileUrl` to an error workbook.

A later row failure does not roll back earlier rows.

Cache is cleared after the database writes, for the products that changed, using the same product detail keys and list/search patterns as price update. Redis is not flushed. If Redis fails, the database result is kept, the product ref ids are stored on the job, and the job still completes with that cache failure in `summary`.

Recovery:

```bash
npm run cache:invalidate-products
```

---

## Status values

`pending` | `validating` | `queued` | `processing` | `completed` | `failed` | `partial_success`

`completed` with `successfulRows: 0` means every included row was already compliant. `failed` means nothing changed and at least one row failed. `partial_success` means some writes changed data and some rows failed.

---

## APIs

### Download templates

```http
GET /api/v1/products/bulk-cod-update/template/download
GET /api/v1/products/bulk-return-update/template/download
```

Files: `bulk-cod-update-template.xlsx`, `bulk-return-update-template.xlsx`.

### Upload

```http
POST /api/v1/products/bulk-cod-update
POST /api/v1/products/bulk-return-update
Content-Type: multipart/form-data
```

Field name: `file`.

COD response `uploadType` is `COD_UPDATE` and ref ids start with `BCU`. Return response `uploadType` is `RETURN_UPDATE` and ref ids start with `BRU`.

Only one COD job runs at a time, and only one return job runs at a time. They do not block price update or product upload.

### History and status

```http
GET /api/v1/products/bulk-cod-update/history?page=1&limit=20
GET /api/v1/products/bulk-cod-update/:refId
GET /api/v1/products/bulk-return-update/history?page=1&limit=20
GET /api/v1/products/bulk-return-update/:refId
```

History is filtered to that job type. Status includes `progress`, `summary`, `errorFileUrl`, and `errorSummary`.

Row error shape:

```json
{
  "rowNumber": 4,
  "sku": "HER/ZIN/08945",
  "column": "codAvailable",
  "invalidValue": "maybe",
  "reason": "codAvailable must be true, false, yes, or no",
  "suggestedFix": "Use true/false or yes/no. Other values are not stored as false."
}
```

### Cancel

```http
POST /api/v1/products/bulk-cod-update/:refId/cancel
POST /api/v1/products/bulk-return-update/:refId/cancel
```

Marks a non-terminal job failed and removes the queued BullMQ job when it can.

---

## Suggested admin UI

Use the price-update history, upload, template, and status screens. Point COD Update at `/products/bulk-cod-update` and Return & Replacement Update at `/products/bulk-return-update`. Show `summary` counts next to the row error table, and link `errorFileUrl` when it is present.

Poll `GET /:refId` while status is `queued`, `validating`, or `processing`.

---

## Notes

- Product upload and price update are unchanged.
- Worker flags default to on: `BULK_COD_UPDATE_PROCESSOR_ENABLED`, `BULK_RETURN_UPDATE_PROCESSOR_ENABLED`.
- Run the enum migration before the first upload. Postgres cannot remove these enum values later.
