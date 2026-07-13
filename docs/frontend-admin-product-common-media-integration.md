# Frontend Admin Product Common Media Integration

**Date:** 2026-07-10  
**Audience:** Admin panel / product wizard UI developers  
**Module:** Products (`/api/v1/products`)  
**Feature:** Shared `common` media for variable (variant) products

---

## 1) Overview

For **variable** products, media can be:

| Kind | `type` | Scope | Where it appears on GET |
|------|--------|--------|-------------------------|
| Variant-specific | `image` / `video` | One variant (`variantSku` / `variantId`) | That variant’s `images[]` only |
| **Common (shared)** | `common` | Whole product (`variantId = null`) | Product `media[]` **and** every `variants[].images[]` |
| Size chart | `size_chart` | Product | Product `media[]` / `sizeChart` field |

**Rule:** If a variable product has `type: "common"` media, the API **automatically prepends** those items into **every** variant’s `images` on GET (admin + public detail).

---

## 2) Auth

- Bearer admin JWT required
- Roles: `SUPER_ADMIN`, `ADMIN` (same as existing product APIs)

---

## 3) Media type enum

```ts
type ProductMediaType = 'image' | 'video' | 'size_chart' | 'common';
```

Use **`common`** for images/videos that should be shared across all variants.

---

## 4) Create / update — JSON body

### Endpoints

- `POST /api/v1/products`
- `PATCH /api/v1/products/:refId`

### Payload pattern

Put shared media in top-level `media[]` with `type: "common"`.  
Do **not** send `variantSku` for common items (ignored if sent).

```json
{
  "name": "Vitamin C Serum",
  "productType": "variable",
  "categoryRefId": "HEA20260016",
  "brandRefId": "BRA20261234",
  "media": [
    {
      "type": "common",
      "url": "images/shared-hero.webp",
      "isPrimary": true,
      "sortOrder": 0
    },
    {
      "type": "common",
      "url": "videos/shared-demo.mp4",
      "isPrimary": false,
      "sortOrder": 1
    }
  ],
  "variants": [
    {
      "sku": "SKU-RED",
      "mrp": 499,
      "sellingPrice": 399,
      "stock": 10,
      "images": [
        {
          "url": "images/red-only.webp",
          "isPrimary": true,
          "sortOrder": 0
        }
      ]
    },
    {
      "sku": "SKU-BLUE",
      "mrp": 499,
      "sellingPrice": 399,
      "stock": 8,
      "images": [
        {
          "url": "images/blue-only.webp",
          "isPrimary": true,
          "sortOrder": 0
        }
      ]
    }
  ]
}
```

### Update warning

When `media` and/or `variants[].images` is sent on PATCH, **all** `product_media` rows for that product are replaced.  
Always resend **every** common + variant image you want to keep.

---

## 5) Create / update — multipart/form-data

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| `data` | text (JSON) | Full product payload (required) |
| `images` | file(s) | Fills product-level `media[]` slots **without** `url` (use with `type: "common"` in JSON) |
| `variantImages_<sku>` | file(s) | Variant-only images |
| `sizeChart` | file | Optional size chart |

Also accepted aliases for product files: `image`, `images[]`.  
Variant alias: `variantImages[SKU]`.

### How common files are bound

1. In `data.media[]`, declare slots with `"type": "common"` and **omit `url`** for new uploads.
2. Attach files on field `images` in the **same order** as those slots.
3. Slots that already have `url` are kept (useful for pre-uploaded videos).

### Example `data` JSON (inside form field)

```json
{
  "name": "Vitamin C Serum",
  "productType": "variable",
  "categoryRefId": "HEA20260016",
  "brandRefId": "BRA20261234",
  "media": [
    { "type": "common", "isPrimary": true, "sortOrder": 0 },
    { "type": "common", "isPrimary": false, "sortOrder": 1 },
    {
      "type": "common",
      "url": "videos/already-uploaded-demo.mp4",
      "sortOrder": 2
    }
  ],
  "variants": [
    {
      "sku": "SKU-RED",
      "mrp": 499,
      "sellingPrice": 399,
      "stock": 10,
      "images": [{ "isPrimary": true, "sortOrder": 0 }]
    }
  ]
}
```

### Example files

| Form field | File | Maps to |
|------------|------|---------|
| `images` | `common-1.webp` | `media[0]` (`type: common`) |
| `images` | `common-2.webp` | `media[1]` (`type: common`) |
| `variantImages_SKU-RED` | `red.webp` | `variants[0].images[0]` |

### curl

```bash
curl -X POST "http://localhost:3005/api/v1/products" \
  -H "Authorization: Bearer <TOKEN>" \
  -F 'data={"name":"Vitamin C Serum","productType":"variable","categoryRefId":"HEA20260016","brandRefId":"BRA20261234","media":[{"type":"common","isPrimary":true,"sortOrder":0},{"type":"common","sortOrder":1}],"variants":[{"sku":"SKU-RED","mrp":499,"sellingPrice":399,"stock":10,"images":[{"isPrimary":true,"sortOrder":0}]}]}' \
  -F "images=@./common-1.webp" \
  -F "images=@./common-2.webp" \
  -F "variantImages_SKU-RED=@./red.webp"
```

### Critical UI rules for multipart

1. **Always set `type: "common"` in `data.media[]`.**  
   Uploading only `images` without that type defaults to `image`, not `common`.
2. **Do not put common files under `variantImages_<sku>`.**  
   Those stay variant-specific.
3. **Videos:** product multipart currently uploads via the image uploader. Prefer uploading video first via the uploads API, then pass `url` in `media[]` with `type: "common"`.

---

## 6) GET response behavior

### Endpoints

- `GET /api/v1/products/:refId` (admin)
- Public product detail also merges common into variant `images`

### What UI receives

1. Top-level `media[]` still contains common rows (`type: "common"`, `variantId: null`).
2. Each `variants[].images[]` starts with common items, then variant-specific items.

### Example (simplified)

```json
{
  "productType": "variable",
  "media": [
    { "id": "m1", "type": "common", "url": { "key": "images/shared-hero.webp" }, "variantId": null, "isPrimary": true, "sortOrder": 0 },
    { "id": "m2", "type": "common", "url": { "key": "videos/shared-demo.mp4" }, "variantId": null, "isPrimary": false, "sortOrder": 1 },
    { "id": "m3", "type": "image", "url": { "key": "images/red-only.webp" }, "variantId": "v-red", "isPrimary": true, "sortOrder": 0 }
  ],
  "variants": [
    {
      "id": "v-red",
      "sku": "SKU-RED",
      "images": [
        { "id": "m1", "type": "common", "isPrimary": false, "sortOrder": 0 },
        { "id": "m2", "type": "common", "isPrimary": false, "sortOrder": 1 },
        { "id": "m3", "type": "image", "isPrimary": true, "sortOrder": 0 }
      ]
    },
    {
      "id": "v-blue",
      "sku": "SKU-BLUE",
      "images": [
        { "id": "m1", "type": "common", "isPrimary": false, "sortOrder": 0 },
        { "id": "m2", "type": "common", "isPrimary": false, "sortOrder": 1 },
        { "id": "m4", "type": "image", "isPrimary": true, "sortOrder": 0 }
      ]
    }
  ]
}
```

### Primary flag rules on GET

- If a variant has its own images → common items are merged with `isPrimary: false`; variant primary is preserved.
- If a variant has **no** own images → common items can carry primary (first / marked primary).

---

## 7) Admin UI implementation guidance

### Product form (variable)

Suggested sections:

1. **Common media (shared)** — gallery for all variants  
   - Save as `media[]` with `type: "common"`
2. **Per-variant media** — only variant-specific shots  
   - Save as `variants[].images` / `variantImages_<sku>`

### Edit screen hydration

- Read common items from either:
  - `data.media.filter(m => m.type === 'common')`, or
  - first variant’s `images.filter(i => i.type === 'common')` (same set)
- Read variant-only items from `variants[].images.filter(i => i.type !== 'common')`
- On save, rebuild payload as:
  - common → `media[]` with `type: "common"`
  - variant-only → `variants[].images` (no `type: "common"`)

### Do / Don’t

| Do | Don’t |
|----|--------|
| Use `type: "common"` for shared assets | Duplicate the same file into every variant’s upload |
| Resend full media set on PATCH when changing media | Send only the newly added common file on update |
| Keep one clear primary among common **or** per variant | Expect `variantSku` to scope common media |

---

## 8) Quick QA checklist

- [ ] Create variable product with 2 common images + 1 image per variant
- [ ] GET detail → each variant `images` starts with both common items
- [ ] Multipart create: `data.media[].type = "common"` + `images` files fill slots
- [ ] Multipart without `type: "common"` → files become `image`, not shared
- [ ] PATCH with full media list keeps commons; omitting a common removes it
- [ ] Variant with no own images still shows common gallery
- [ ] Simple product: `common` is stored, but auto-merge into variants applies to **variable** products

---

## 10) Bulk upload (Excel)

Variable products can also receive common media via spreadsheet columns.
The same rule applies to **all** bulk media fields (primary/gallery/common/inline): **URL is required**, filename/name is optional.

### Sample template columns (5)

| Column | Purpose |
|--------|---------|
| `common_media_1_url` … `common_media_5_url` | **Required** — public `http(s)` image URL or `images/…` storage key |
| `common_media_1` … `common_media_5` | Optional name/filename (gallery/ZIP hint only) |

### Upload supports N columns

Template shows 5 for convenience. You may add more columns in the sheet, e.g.:

- `common_media_6_url`
- `common_media_6`
- `common_media_7_url`
- …

Any `common_media_<n>` / `common_media_<n>_url` present is parsed (not limited to 5).
Rows with only a filename and no URL are ignored.

### Behavior

- Public URL is downloaded into `images/` (same as admin uploads).
- Storage keys (`images/…`) are used as-is.
- Optional filename is used only if the public URL download fails (gallery / ZIP fallback).
- Stored as product `media[]` with `type: "common"`.
- On GET for variable products, merged into every variant’s `images` (same as manual create).

### Example row (variable)

| common_media_1_url | common_media_2_url | common_media_3_url |
|--------------------|--------------------|-------------------|
| https://cdn.example.com/shared-hero.webp | https://cdn.example.com/shared-side.webp | https://cdn.example.com/demo.mp4 |

---

## 11) Related endpoints

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/v1/products` | Create (JSON or multipart) |
| `PATCH` | `/api/v1/products/:refId` | Update; media replace semantics |
| `GET` | `/api/v1/products/:refId` | Detail with common merged into variants |
| `GET` | `/api/v1/products` | List (media present; merge mainly matters on detail) |
| `POST` | `/api/v1/products/bulk-upload` | Excel + optional images ZIP |
| `GET` | `/api/v1/products/bulk-upload/template/download` | Sample XLSX including `common_media_1..5` |
