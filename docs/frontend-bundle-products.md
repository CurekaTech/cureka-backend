# Bundle Product Module — Frontend Integration Guide

This guide explains how to build the Bundle Product admin UI. Bundle products reuse the Product module architecture; only the differences are documented here.

**Swagger:** `/api/v1/docs` → **Bundle Products**  
**Base path:** `/api/v1/bundle-products`

---

## Overview

| Concern | Behaviour |
|---------|-----------|
| Form / listing / filters / actions | Same as Product module wherever possible |
| Variants | **Not supported** — hide variant UI (one internal pricing variant is stored) |
| Linked products | Search existing products → add with quantity |
| Pricing | Manual MRP / selling price / discount (not calculated from children) |
| Inventory | Bundle-level stock (ignore child stock for now) |
| Categories | Same as products (single or multiple hierarchies via `categories[]`) |
| Health concerns / wellness goals | Same as products (`healthConcernRefIds`, `wellnessGoalRefIds`) |
| Description | Same as products (`description`) |
| Expiry | Same as simple products (`expiryDate`, `expiresIn`, `expiresInMonths`) |
| Images / SEO | Same as products (`media[]`, `metaTitle`, `metaDescription`, `metaKeywords`) |
| Manufacturer / packer / country | Same as products (`manufacturerRefId`, `packerRefId`, `countryOfOriginRefId`) |
| Components | Same as products (`components`) |
| Commerce flags | Same as products — subscription, COD, EMI, return, replacement |
| SKU | Unique across all variants; **auto-generated** if omitted (`BND-…`) |
| Permissions | Same as products (`SUPER_ADMIN` / `ADMIN`) |

`productType` is always `bundle` on these endpoints (forced by the API).

---

## Create / Edit form

### Hide

- Variant section
- Variant generation / attribute combinations

### Include (same as products)

| Field | API field(s) | Notes |
|-------|----------------|-------|
| Description | `description` | Bundle description (product-level) |
| Health concerns | `healthConcernRefIds` | Array of health concern refIds or names |
| Wellness goals | `wellnessGoalRefIds` | Array of wellness goal refIds or names |
| Manufacturer | `manufacturerRefId` | Same as products |
| Packer | `packerRefId` | Same as products |
| Country of origin | `countryOfOriginRefId` | Same as products |
| Components | `components` | Free-text components / composition |
| Subscription | `subscriptionEnabled` | boolean, default `false` |
| Cash on delivery | `codAvailable` | boolean, default `false` |
| EMI | `emiAvailable` | boolean, default `false` |
| Return available | `returnAllowed` | boolean, default `false` |
| Return days | `returnWindowDays` | int ≥ 0 |
| Return policy | `returnPolicy` | text (e.g. `"7 Days Return"`) |
| Replacement allowed | `replaceAllowed` | boolean, default `false` |
| Replacement days | `replaceWindowDays` | int ≥ 0 |
| Expires in (days) | `expiresIn` | Applied to pricing variant |
| Expires in months | `expiresInMonths` | Product shelf-life field |
| Expiry date | `expiryDate` | `dd-mm-yyyy`; applied to pricing variant |
| Images | `media[]` (+ multipart files like products) | Bundle images |
| SEO | `metaTitle`, `metaDescription`, `metaKeywords` | Same as products |
| SKU | `sku` | Optional; backend generates unique SKU if omitted |

### Add (bundle-only)

#### Curated By

- Type: text input  
- Placeholder: `Dr. Patel, Dr. Shah`  
- API field: `curatedBy` (string, optional)  
- Multiple names can be comma-separated

#### Curated For

- Type: text area  
- Example: `Recommended for daily skincare routine and sensitive skin.`  
- API field: `curatedFor` (string, optional)

#### Bundle Products

Searchable product selector:

```
Search Product → Select → Quantity → Add → Repeat
```

Display selected rows:

| Product | Quantity | Remove |
|---------|----------|--------|

API field: `bundleItems`

```json
{
  "bundleItems": [
    { "childProductRefId": "PRO20261234", "quantity": 1 },
    { "childProductRefId": "PRO20265678", "quantity": 2 }
  ]
}
```

**Validation:** at least one item is required.

#### Pricing & stock (required)

Send either top-level shortcuts **or** a single `variants[0]` entry (backend stores one internal pricing variant):

```json
{
  "mrp": 1999,
  "sellingPrice": 1499,
  "discountPercentage": 25,
  "stock": 100,
  "sku": "BND-SUMMER-KIT-001"
}
```

Do **not** auto-sum child product prices or stock. SKU must be unique across the catalog.

---

## Create request example

`POST /api/v1/bundle-products`

```json
{
  "name": "Summer Skin Care Kit",
  "description": "Expert curated summer skincare essentials in one kit.",
  "brandRefId": "BRA20261234",
  "manufacturerRefId": "MAN20261234",
  "packerRefId": "PAC20261234",
  "countryOfOriginRefId": "IND20260001",
  "components": "Face wash, moisturizer, sunscreen",
  "categoryRefId": "HEA20260016",
  "categories": [
    {
      "categoryRefId": "HEA20260016",
      "subCategoryRefId": "SUB20260011"
    }
  ],
  "healthConcernRefIds": ["HLT20260001", "HLT20260002"],
  "wellnessGoalRefIds": ["WEL20260001"],
  "curatedBy": "Dr. Patel, Dr. Shah",
  "curatedFor": "Recommended for daily skincare routine and sensitive skin.",
  "mrp": 2499,
  "sellingPrice": 1999,
  "stock": 100,
  "sku": "BND-SUMMER-KIT-001",
  "expiresIn": 365,
  "expiresInMonths": 12,
  "expiryDate": "31-12-2027",
  "subscriptionEnabled": true,
  "codAvailable": true,
  "emiAvailable": false,
  "returnAllowed": true,
  "returnWindowDays": 7,
  "returnPolicy": "7 Days Return",
  "replaceAllowed": true,
  "replaceWindowDays": 7,
  "bundleItems": [
    { "childProductRefId": "PRO20260001", "quantity": 1 },
    { "childProductRefId": "PRO20260002", "quantity": 1 },
    { "childProductRefId": "PRO20260003", "quantity": 1 }
  ],
  "media": [
    { "type": "image", "url": { "key": "products/bundles/summer-kit.jpg", "name": "summer-kit.jpg" }, "isPrimary": true, "sortOrder": 0 }
  ],
  "metaTitle": "Summer Skin Care Kit",
  "metaDescription": "Expert curated summer skincare bundle",
  "metaKeywords": ["skincare", "bundle", "summer"]
}
```

Notes:

- Do **not** send `productType` (API forces `bundle`).
- Do **not** send `attributeRefIds` / multi-variant payloads.
- Health concerns, wellness goals, description, expiry, media, and SEO work like products.
- Duplicate `sku` returns a conflict error.

---

## Update request example

`PATCH /api/v1/bundle-products/:refId`

```json
{
  "curatedBy": "Dr. Patel",
  "stock": 80,
  "bundleItems": [
    { "childProductRefId": "PRO20260001", "quantity": 1 },
    { "childProductRefId": "PRO20260004", "quantity": 2 }
  ]
}
```

- Omitting `bundleItems` leaves existing links unchanged.
- Sending `bundleItems` **replaces** the full set.
- Sending `mrp` / `sellingPrice` / `stock` updates the pricing variant.

---

## Response fields (extra vs products)

```json
{
  "refId": "PRO20269999",
  "productType": "bundle",
  "curatedBy": "Dr. Patel, Dr. Shah",
  "curatedFor": "Recommended for daily skincare routine...",
  "outOfStock": false,
  "bundleItems": [
    {
      "id": "...",
      "childProductRefId": "PRO20260001",
      "childProductName": "Face Wash",
      "quantity": 1
    }
  ],
  "variants": [
    {
      "sku": "BND-SUMMER-KIT-001",
      "mrp": 2499,
      "sellingPrice": 1999,
      "stock": 100
    }
  ],
  "categories": [ /* same as products */ ]
}
```

UI tip: show MRP / selling / stock from `variants[0]` (or map to form fields on load).

---

## Listing pages

| Page | Method | Path | Status filter |
|------|--------|------|---------------|
| All / main list | `GET` | `/api/v1/bundle-products` | Optional `?status=` (omit = all statuses) |
| Drafts | `GET` | `/api/v1/bundle-products/drafts` | `draft` |
| Pending | `GET` | `/api/v1/bundle-products/pending` | `pending_review` |
| Rejected | `GET` | `/api/v1/bundle-products/rejected` | `rejected` |
| Published only | `GET` | `/api/v1/bundle-products?status=published` | `published` |

Query params (same as products): `page`, `limit`, `search`, `status`, `categoryRefId`, `brandRefId` / `brandRefIds`, `sortBy`, `sortOrder`, etc.

**Note:** Create submits bundles as `pending_review`, so the main list must not be locked to `published` only.

Reuse the Product table layout; hide variant-specific columns if unused. Show `outOfStock` badge like products.

---

## Actions

| Action | Endpoint |
|--------|----------|
| Create | `POST /bundle-products` |
| Edit | `PATCH /bundle-products/:refId` |
| Detail | `GET /bundle-products/:refId` |
| Publish | `PATCH /bundle-products/:refId/publish` |
| Unpublish | `PATCH /bundle-products/:refId/unpublish` |
| Change status | `PATCH /bundle-products/:refId/status` |
| Submit for review | `POST /bundle-products/:refId/submit-for-review` |
| Approve | `POST /bundle-products/:refId/approve` |
| Reject | `POST /bundle-products/:refId/reject` body: `{ "reason": "…" }` (alias `{ "rejectionReason": "…" }` also accepted). Detail/list return `rejectionReason`. |
| Soft delete | `DELETE /bundle-products/:refId` |
| Restore | `POST /bundle-products/:refId/restore` |
| Out of stock | `POST /bundle-products/bulk-mark-out-of-stock` `{ "productRefIds": ["…"] }` |
| Restore stock | `POST /bundle-products/bulk-restore-stock` `{ "items": [{ "productRefId": "…", "stock": 50 }] }` |

---

## Product search (for picker)

Reuse the existing product list/search API (non-bundle products preferred):

`GET /api/v1/products?search=…&productType=simple`  
(and/or `variable`)

Search by name / SKU / refId as the product list already supports.

Do **not** allow selecting another bundle as a child in Phase 1 (backend currently allows any product — optionally filter UI to `simple` / `variable` only).

---

## Validation checklist

- [ ] Name required  
- [ ] Category required (flat or `categories[]`)  
- [ ] Brand required  
- [ ] MRP + selling price + stock required on create  
- [ ] At least one `bundleItems` row  
- [ ] Quantity ≥ 1 per row  
- [ ] No variant UI  

---

## Notes

- Bulk upload for bundles is **out of scope** for Phase 1.
- Nested bundles / auto pricing / auto stock sync are future work.
- Reuse Product components to keep UI consistent and reduce effort.
