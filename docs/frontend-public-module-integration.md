# Public Module — UI Integration Guide

Frontend handoff for recent **public** API changes:

1. **Out of stock (`outOfStock`)** on product list / search / detail  
2. **Homepage health concerns** (with `sortIndex`)  
3. **Public bundles** (list + detail, including `bundleIcon`)

**Base URL:** `/api/v1`  
**Auth:** none (public)

Typical response envelope:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

Paginated list `data` usually looks like:

```json
{
  "data": [ /* items */ ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

Images (`icon`, `banner`, `logo`, `bundleIcon`, `primaryImageUrl`, `media[].url`) are storage references. Prefer the signed `url` field when present:

```json
{
  "key": "icons/abc.png",
  "name": "abc.png",
  "url": "https://..."
}
```

---

## 1. Out of stock (`outOfStock`)

Admin can mark a **variant** as out of stock (`outOfStock: true`) independently of stock quantity.

### Where it appears

| API | Field | Meaning |
|-----|--------|---------|
| `GET /public/products` (list cards) | `outOfStock` | OOS of the **displayed list variant** (`variantId` / `defaultVariantId`) |
| `GET /public/products` | `pricing.inStock` | Same as `!outOfStock` for that list variant |
| `GET /public/products/search` | `outOfStock` | OOS of **that search row’s variant** |
| `GET /public/products/:slug` | `variants[].outOfStock` | OOS per variant |
| `GET /public/bundles` | `outOfStock` | OOS of the bundle’s displayed pricing variant |
| `GET /public/bundles/:slug` | `variants[].outOfStock` | OOS per pricing variant |

### UI rules

- Storefront lists/cards show **one variant per row/card** → use that item’s `outOfStock`.
- Do **not** treat product-level availability as “any variant available” for list cards; use the card’s `outOfStock`.
- On detail, bind OOS UI to the **selected variant’s** `variants[].outOfStock`.
- Prefer `outOfStock` for “marked unavailable” badges.  
  `inStock` also respects the OOS flag (`available = !outOfStock && stock rules`).

### List card example

```json
{
  "refId": "PRD20261234",
  "name": "Whey Protein",
  "variantId": "uuid-of-displayed-variant",
  "defaultVariantId": "uuid-of-displayed-variant",
  "pricing": {
    "minSellingPrice": 1499,
    "maxSellingPrice": 1499,
    "minMrp": 1999,
    "maxDiscountPercentage": 25,
    "inStock": false
  },
  "outOfStock": true
}
```

| `outOfStock` | UI |
|--------------|----|
| `true` | Show OOS badge / disable add-to-cart for this card |
| `false` | Treat as available |

### Detail / search example

```json
{
  "variants": [
    {
      "id": "...",
      "sku": "SUP/NES/001",
      "slug": "whey-1kg",
      "stock": 10,
      "inStock": false,
      "outOfStock": true
    }
  ]
}
```

---

## 2. Homepage health concerns

### Endpoint

```http
GET /api/v1/public/homepage/health-concerns
```

Returns **active** health concerns with `inHomePage = true`, already sorted for homepage display.

### Sort order

1. `sortIndex` ASC (lower first)  
2. `null` sortIndex last  
3. then `name` ASC  

UI should render in array order (or re-sort by `sortIndex` the same way).

### Response item

```json
{
  "refId": "HLT20260001",
  "name": "Immunity",
  "slug": "immunity",
  "description": "Support your immune system",
  "icon": { "key": "icons/...", "name": "...", "url": "https://..." },
  "banner": { "key": "banners/...", "name": "...", "url": "https://..." },
  "sortIndex": 1
}
```

| Field | Use |
|-------|-----|
| `name` / `slug` | Label + link (e.g. products filtered by health concern slug) |
| `icon` | Card / circular icon |
| `banner` | Optional wide image |
| `sortIndex` | Display order (lower = first; `null` = unordered) |

### Related homepage endpoints (existing)

| Endpoint | Purpose |
|----------|---------|
| `GET /public/homepage/sections` | Combined homepage sections payload |
| `GET /public/homepage/banners` | Hero / festival / brand banners |
| `GET /public/homepage/category/header` | Header category tree |
| `GET /public/homepage/best-sellers` | Best sellers (default sort: CMS `bestsellerIndex`, then `publishedAt`) |
| `GET /public/homepage/home-sections/active` | Active custom home sections |
| `GET /public/homepage/home-sections/:slug` | One custom section by slug |

> Note: homepage section `expertCuratedBundles` still returns **health concern cards** (icon only, limited count).  
> Use **`/public/homepage/health-concerns`** when you need the full active homepage set **with `sortIndex` + banner**.  
> For **View all** (brands / wellness goals / health concerns), see [frontend-homepage-view-all.md](./frontend-homepage-view-all.md).

---

## 3. Public bundles

Dedicated storefront APIs for **published** `productType=bundle` products.

Admin create/edit (with `bundleIcon`) remains under `/api/v1/bundle-products` — see [frontend-bundle-products.md](./frontend-bundle-products.md).

### 3.1 List bundles

```http
GET /api/v1/public/bundles
```

#### Query params

| Param | Type | Default | Notes |
|-------|------|---------|--------|
| `page` | number | `1` | |
| `limit` | number | `20` | |
| `search` | string | — | Name / related search |
| `sortBy` | `name` \| `publishedAt` \| `price` | — | |
| `sortOrder` | `ASC` \| `DESC` | — | |
| `brandRefId` | string | — | Filter by brand refId |
| `brandSlug` | string | — | Filter by brand slug |

#### List item fields

| Field | Description |
|-------|-------------|
| `name` | Bundle name |
| `slug` | Detail route key |
| `description` | Short description |
| `bundleIcon` | Bundle icon image (signed URL when available) |
| `brand` | Brand object (see below) |
| `curatedBy` | e.g. doctor / expert names |
| `curatedFor` | Who the bundle is for |
| `pricing` | Price summary + `inStock` |
| `outOfStock` | OOS for displayed pricing variant |
| `publishedAt` | Publish time |
| `permalink` / `productPageUrl` | Navigation helpers |
| `defaultVariantId` | Variant UUID for add-to-cart |

#### Brand object

```json
{
  "refId": "BRA20261234",
  "name": "Nestle",
  "slug": "nestle",
  "logo": { "key": "...", "url": "https://..." },
  "description": "..."
}
```

#### Example list item

```json
{
  "refId": "PRD20269999",
  "name": "Summer Skin Care Kit",
  "slug": "summer-skin-care-kit",
  "description": "Expert curated summer essentials",
  "bundleIcon": { "key": "icons/summer-kit.png", "url": "https://..." },
  "brand": {
    "refId": "BRA20261234",
    "name": "Nestle",
    "slug": "nestle",
    "logo": { "key": "logos/nestle.png", "url": "https://..." },
    "description": null
  },
  "curatedBy": "Dr. Patel, Dr. Shah",
  "curatedFor": "Recommended for daily skincare and sensitive skin.",
  "pricing": {
    "minSellingPrice": 1999,
    "maxSellingPrice": 1999,
    "minMrp": 2499,
    "maxDiscountPercentage": 20,
    "inStock": true
  },
  "outOfStock": false,
  "publishedAt": "2026-07-01T10:00:00.000Z",
  "permalink": "/shop/.../summer-skin-care-kit",
  "productPageUrl": null,
  "defaultVariantId": "uuid"
}
```

#### Suggested list UI

- Image: `bundleIcon` (fallback to brand logo if null)  
- Title: `name`  
- Brand row: `brand.logo` + `brand.name`  
- Meta: `curatedBy` / `curatedFor`  
- Price: `pricing.minSellingPrice` / `pricing.minMrp`  
- Badge: `outOfStock`  
- Click → `/bundles/{slug}` (or your route) using `slug`

---

### 3.2 Bundle detail

```http
GET /api/v1/public/bundles/:slug
```

Returns everything from the list card, plus:

| Field | Description |
|-------|-------------|
| `id` | Internal id |
| `components` | Components text |
| `categoryRefId` / `categoryName` / `categorySlugPath` | Category context |
| `subscriptionEnabled` / `codAvailable` / `emiAvailable` | Commerce flags |
| `metaTitle` / `metaDescription` / `metaKeywords` | SEO |
| `media[]` | Gallery |
| `variants[]` | Pricing variant(s) with `mrp`, `sellingPrice`, `stock`, `inStock`, `outOfStock` |
| `bundleItems[]` | Child products (`childProductRefId`, name, slug, `quantity`) |
| `healthConcerns[]` / `wellnessGoals[]` / `tags[]` | Related masters |

#### Example `bundleItems`

```json
{
  "bundleItems": [
    {
      "childProductRefId": "PRD20260001",
      "childProductName": "Face Wash",
      "childProductSlug": "face-wash",
      "quantity": 1
    }
  ]
}
```

#### Suggested detail UI

1. Hero: `bundleIcon` + gallery `media`  
2. Title / brand / curated by & for  
3. Price + OOS from selected `variants[]` entry (usually one)  
4. Add to cart with `defaultVariantId` or `variants[0].id`  
5. “What’s inside”: `bundleItems`  
6. SEO: `metaTitle` / `metaDescription`

#### Errors

| Status | When |
|--------|------|
| `404` | Slug missing, not published, or not a bundle |

---

## Quick integration checklist

- [ ] Product list cards: read top-level `outOfStock` (not only stock qty)  
- [ ] Product detail: use selected variant’s `outOfStock`  
- [ ] Homepage health concerns section: call `GET /public/homepage/health-concerns` and respect `sortIndex` order  
- [ ] Bundles listing page: `GET /public/bundles`  
- [ ] Bundle detail page: `GET /public/bundles/:slug`  
- [ ] Show `bundleIcon`, brand logo/name, `curatedBy`, `curatedFor`  
- [ ] Use signed image `url` fields where available  

---

## Related docs

- Admin bundle create/edit: [frontend-bundle-products.md](./frontend-bundle-products.md)  
- Admin health concerns: [health-concerns-api.md](./health-concerns-api.md)
