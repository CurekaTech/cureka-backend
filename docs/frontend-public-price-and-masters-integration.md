# Public API Updates — UI Integration (Price Filter + Masters)

**Date:** 2026-07-06  
**Audience:** Storefront UI developers

---

## 1. Product listing — price filter

**Endpoint:** `GET /api/v1/public/products`  
**Auth:** None

Filter products by **active variant selling price**. A product is included when at least one active variant has `sellingPrice` within the range.

### Query params

| Param | Type | Example | Notes |
|-------|------|---------|-------|
| `minPrice` | number | `199` | Minimum price (inclusive), ≥ 0 |
| `maxPrice` | number | `999` | Maximum price (inclusive), ≥ 0 |
| `priceRange` | string | `199,999` or `199-999` | Alternative to min/max |

Use **either** `priceRange` **or** `minPrice`/`maxPrice`. If both are sent, explicit `minPrice`/`maxPrice` win when set.

### Examples

```http
GET /api/v1/public/products?categorySlug=hair&page=1&limit=20&sortOrder=ASC&minPrice=199&maxPrice=999
```

```http
GET /api/v1/public/products?categorySlug=hair&priceRange=199,999&page=1&limit=20
```

```http
GET /api/v1/public/products?categorySlug=hair&minPrice=500
```

Works with all existing filters: `categorySlug`, `brandSlug`, category facets, etc.

### UI notes

- Bind a price slider / min–max inputs to `minPrice` and `maxPrice`.
- Reset `page` to `1` when the price range changes.
- Price filter also works on `GET /api/v1/public/products/search` (variant search).

---

## 2. Active brands & categories — common API

**Endpoint:** `GET /api/v1/public/masters`  
**Auth:** None  
Returns only **active** records.

### Required

| Param | Values |
|-------|--------|
| `type` | `brand` \| `category` |

### Optional

| Param | Default | Notes |
|-------|---------|-------|
| `page` | `1` | |
| `limit` | `20` | Max `100` |
| `search` | — | Matches `name`, `slug`, `refId` |
| `sortBy` | `name` (brand), `position` (category) | See table below |
| `sortOrder` | `ASC` | `ASC` \| `DESC` |
| `categoryHierarchyLevel` | — | Category only: `0` root, `1` child, `2` grandchild, `3` great-grandchild |
| `parentCategoryRefId` | — | Category only: children of this parent |

### Examples

```http
GET /api/v1/public/masters?type=brand&page=1&limit=30&sortBy=name&sortOrder=ASC
GET /api/v1/public/masters?type=brand&search=nova
GET /api/v1/public/masters?type=category&categoryHierarchyLevel=0&page=1&limit=50
GET /api/v1/public/masters?type=category&parentCategoryRefId=DER20269976&page=1&limit=20
```

### Response

```json
{
  "success": true,
  "data": {
    "type": "brand",
    "data": [
      {
        "refId": "BRD20241234",
        "name": "Nova Labs",
        "slug": "nova-labs",
        "logo": { "key": "...", "name": "...", "url": "https://..." }
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 30,
    "totalPages": 2,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "message": "Active masters retrieved successfully"
}
```

### Item shapes

**Brand (`type=brand`)**

| Field | Type |
|-------|------|
| `refId` | string |
| `name` | string |
| `slug` | string |
| `logo` | `{ key, name, url }` \| null |

**Category (`type=category`)**

| Field | Type |
|-------|------|
| `refId` | string |
| `name` | string |
| `slug` | string |
| `position` | number |
| `hierarchyLevel` | `0` \| `1` \| `2` \| `3` |
| `parentCategoryRefId` | string \| null |
| `image` | `{ key, name, url }` \| null |
| `banner` | `{ key, name, url }` \| null |

### Sortable fields

| `type` | `sortBy` options | Default |
|--------|------------------|---------|
| `brand` | `name`, `slug`, `createdAt` | `name` ASC |
| `category` | `name`, `position`, `hierarchyLevel`, `createdAt` | `position` ASC |

### Category cascading (optional UX)

```
Roots:     ?type=category&categoryHierarchyLevel=0
Children:  ?type=category&parentCategoryRefId=<selectedRefId>
```

---

## Quick checklist

- [ ] Price slider sends `minPrice` / `maxPrice` on product listing requests
- [ ] Reset `page=1` when price or filters change
- [ ] Brand/category pickers use `GET /public/masters?type=...`
- [ ] Use `slug` or `refId` from masters response in product filter URLs (`brandSlug`, `categorySlug`, etc.)
