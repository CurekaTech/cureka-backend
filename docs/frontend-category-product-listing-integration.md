# Category Product Listing — Frontend Integration Guide

**Date:** 2026-07-06  
**Audience:** Storefront / UI developers  
**API:** Public product listing with category page metadata and category-filter facets

---

## 1. Overview

The public product listing API now returns **category page context** when the list is scoped by a category. This supports:

- Category **banner**, **icon** (`image`), **above-the-fold** (ATF), and **below-the-fold** (BTF) content
- **Category filters** (facets) with selectable values
- Correct behavior when the user lands on a **child category** (sub-category) URL

**Endpoint (unchanged path):**

```
GET /api/v1/public/products
```

**Authentication:** None (public)

---

## 2. When is `category` returned?

| Query param | Required | Description |
|-------------|----------|-------------|
| `categorySlug` | One of slug/refId | Category URL slug, e.g. `derma-cat`, `skin-care` |
| `categoryRefId` | One of slug/refId | Category ref ID, e.g. `DER20269976` |

If **neither** is sent, `category` is `null`.

If slug/refId is sent but **not found**, API returns **404**.

### Examples

```http
GET /api/v1/public/products?categorySlug=derma-cat&page=1&limit=20&sortOrder=ASC
```

```http
GET /api/v1/public/products?categoryRefId=DER20269976&page=1&limit=20
```

---

## 3. Response envelope

All public APIs use the standard wrapper:

```json
{
  "success": true,
  "data": { /* see below */ },
  "message": "Products retrieved successfully",
  "timestamp": "2026-07-06T06:52:53.828Z"
}
```

### 3.1 List payload shape

`data` is a **paginated product list** plus optional `category`:

```typescript
interface PublicProductListResponse {
  data: PublicProductCard[];   // product cards (same as before)
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  category: CategoryListingContext | null;  // NEW — only when categorySlug/categoryRefId sent
}
```

> **Note:** Product rows are in `data.data` (nested `data` array). This matches existing pagination responses.

---

## 4. Category object (`category`)

### 4.1 Root vs child category behavior

| User filters by | Products filtered by | `category` metadata from | `selectedCategory` |
|-----------------|----------------------|--------------------------|--------------------|
| **Root** category (L1) | That root category | Same root category | `null` |
| **Child** category (L2–L4) | That child category | **Root ancestor** (banner, icon, ATF, BTF) | The child that was selected |

**Why:** Banner, icon, and ATF/BTF are stored on the **root** category. Category filters are also assigned at root level. Products are still filtered by the **slug/refId the user selected** (child or root).

### 4.2 TypeScript types

```typescript
interface StorageFileReference {
  key: string;
  name: string;
  url: string;  // signed URL — use for <img src>
}

interface CategoryFilterFacet {
  refId: string;    // e.g. "SKI20265900"
  name: string;     // e.g. "Skin Type"
  values: string[]; // e.g. ["Oily", "Dry", "Sensitive"]
}

interface CategoryListingContext {
  refId: string;
  name: string;
  slug: string;
  image: StorageFileReference | null;   // category icon
  banner: StorageFileReference | null;  // category banner
  aboveTheFold: string | null;          // HTML rich text (ATF)
  belowTheFold: string | null;          // HTML rich text (BTF)
  categoryFilters: CategoryFilterFacet[];
  selectedCategory: {
    refId: string;
    name: string;
    slug: string;
  } | null;  // set when filtering by a child category
}
```

### 4.3 Example — child category (`derma-cat`)

Request:

```http
GET /api/v1/public/products?categorySlug=derma-cat&page=1&limit=20
```

Relevant part of response:

```json
{
  "success": true,
  "data": {
    "data": [ /* product cards */ ],
    "total": 3,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false,
    "category": {
      "refId": "BAB20269258",
      "name": "Baby care derma",
      "slug": "baby-care-derma",
      "image": {
        "key": "images/20efa382-....webp",
        "name": "cureka-files-prod",
        "url": "https://storage.googleapis.com/..."
      },
      "banner": {
        "key": "banners/edd761d3-....webp",
        "name": "cureka-files-prod",
        "url": "https://storage.googleapis.com/..."
      },
      "aboveTheFold": null,
      "belowTheFold": null,
      "categoryFilters": [
        {
          "refId": "SKI20265900",
          "name": "Skin Type",
          "values": ["Oily", "Combination", "Dry", "Sensitive"]
        },
        {
          "refId": "COL20261618",
          "name": "Color",
          "values": ["Red", "Blue", "Green"]
        }
      ],
      "selectedCategory": {
        "refId": "DER20269976",
        "name": "derma cat",
        "slug": "derma-cat"
      }
    }
  }
}
```

**UI usage:**

| Field | Suggested use |
|-------|----------------|
| `category.banner` | Hero / top banner on category PLP |
| `category.image` | Category icon or thumbnail |
| `category.aboveTheFold` | Rich HTML block above product grid |
| `category.belowTheFold` | Rich HTML block below product grid |
| `category.selectedCategory` | Breadcrumb active item / page title when on sub-category |
| `category.name` / `category.slug` | Root category in breadcrumb |

---

## 5. Category filters (`categoryFilters`)

### 5.1 What are category filters?

Faceted filters defined on the **root** category (e.g. Skin Type, Color). Each filter has a list of **values** the UI can render as checkboxes/chips.

### 5.2 How `values` are populated

Priority order:

1. **Product-bound values** — distinct values assigned to published products in the root category tree
2. **Fallback** — master-defined allowed values when no products are bound yet

So the sidebar always has options to show, but **filtering only returns products that actually have that value assigned** in the backend.

### 5.3 Rendering filter UI

```tsx
// Pseudocode
category.categoryFilters.map((filter) => (
  <FilterGroup key={filter.refId} title={filter.name}>
    {filter.values.map((value) => (
      <FilterChip
        key={value}
        label={value}
        selected={isSelected(filter.refId, value)}
        onClick={() => applyFilter(filter.refId, value)}
      />
    ))}
  </FilterGroup>
))}
```

---

## 6. Filtering products by category filters

Use the **same** `GET /api/v1/public/products` endpoint. Keep `categorySlug` or `categoryRefId` and add filter query params.

### Option A — single filter (simple)

```http
GET /api/v1/public/products?categorySlug=derma-cat&categoryFilterRefId=SKI20265900&categoryFilterValues=Oily
```

Multiple values (OR within same filter):

```http
GET /api/v1/public/products?categorySlug=derma-cat&categoryFilterRefId=SKI20265900&categoryFilterValues=Oily,Dry
```

`categoryFilterValues` accepts comma-separated string or repeated query params.

### Option B — multiple filters (JSON)

```http
GET /api/v1/public/products?categorySlug=derma-cat&categoryFilters=[{"categoryFilterRefId":"SKI20265900","values":["Oily"]},{"categoryFilterRefId":"COL20261618","values":["Red"]}]
```

URL-encode the JSON in real requests.

```typescript
const categoryFilters = [
  { categoryFilterRefId: 'SKI20265900', values: ['Oily'] },
  { categoryFilterRefId: 'COL20261618', values: ['Red'] },
];
const params = new URLSearchParams({
  categorySlug: 'derma-cat',
  page: '1',
  limit: '20',
  categoryFilters: JSON.stringify(categoryFilters),
});
```

Multiple filters are **AND**ed (product must match all). Multiple values in one filter are **OR**ed.

### 6.1 Suggested client state

```typescript
interface CategoryListingState {
  categorySlug: string;           // from route
  selectedFilters: Record<string, string[]>;  // refId -> values
  page: number;
  sortOrder: 'ASC' | 'DESC';
}

function buildProductsUrl(state: CategoryListingState): string {
  const filters = Object.entries(state.selectedFilters)
    .filter(([, values]) => values.length > 0)
    .map(([categoryFilterRefId, values]) => ({ categoryFilterRefId, values }));

  const params = new URLSearchParams({
    categorySlug: state.categorySlug,
    page: String(state.page),
    limit: '20',
    sortOrder: state.sortOrder,
  });

  if (filters.length === 1) {
    params.set('categoryFilterRefId', filters[0].categoryFilterRefId);
    params.set('categoryFilterValues', filters[0].values.join(','));
  } else if (filters.length > 1) {
    params.set('categoryFilters', JSON.stringify(filters));
  }

  return `/api/v1/public/products?${params}`;
}
```

---

## 7. Full query parameters reference

### Pagination & sort (existing)

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `page` | number | `1` | |
| `limit` | number | `20` | Max `100` |
| `search` | string | — | Product / variant slug search |
| `sortBy` | string | — | `name`, `publishedAt`, `price`, `variantSlug` |
| `sortOrder` | string | `DESC` | `ASC` or `DESC` |

### Category scope (triggers `category` in response)

| Param | Type | Notes |
|-------|------|-------|
| `categorySlug` | string | Preferred for storefront routes |
| `categoryRefId` | string | Alternative to slug |

### Category filter facets (optional, combine with category scope)

| Param | Type | Notes |
|-------|------|-------|
| `categoryFilterRefId` | string | Single filter refId |
| `categoryFilterValues` | string[] | Required with `categoryFilterRefId` |
| `categoryFilters` | string (JSON) | Multi-filter; see Option B above |

### Price range

Filter by **active variant selling price**. A product is included when it has at least one active variant whose `sellingPrice` falls within the range.

| Param | Type | Notes |
|-------|------|-------|
| `priceRange` | string | Inclusive range as `min,max` or `min-max`, e.g. `100,500` or `100-500` |
| `minPrice` | number | Minimum price (optional; can combine with `maxPrice` instead of `priceRange`) |
| `maxPrice` | number | Maximum price (optional) |

Examples:

```http
GET /api/v1/public/products?categorySlug=hair&priceRange=100,500&page=1&limit=20
GET /api/v1/public/products?categorySlug=hair&minPrice=100&maxPrice=500
GET /api/v1/public/products?categorySlug=hair&minPrice=500
```

If both `priceRange` and `minPrice`/`maxPrice` are sent, explicit `minPrice`/`maxPrice` take precedence for any bound not already set.

### Other filters (unchanged)

| Param | Type |
|-------|------|
| `brandSlug` / `brandRefId` | string |
| `healthConcernSlug` / `healthConcernRefId` | string |
| `wellnessGoalRefId` | string |
| `productNatureRefId` | string |
| `productType` | `simple` \| `variable` \| `bundle` |
| `variantSlug` | string |
| `tagSlug` | string |

---

## 8. Product card shape (unchanged)

Each item in `data.data` is a `PublicProductCard`:

```typescript
interface PublicProductCard {
  id: string;
  refId: string;
  name: string;
  slug: string;
  productType: 'simple' | 'variable' | 'bundle';
  defaultVariantId: string | null;
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subCategoryName: string | null;
  brandRefId: string | null;
  brandName: string | null;
  primaryImageUrl: StorageFileReference | null;
  pricing: {
    minSellingPrice: number;
    maxSellingPrice: number;
    minMrp: number;
    maxDiscountPercentage: number | null;
    inStock: boolean;
  };
  variantId: string | null;
  subscriptionEnabled: boolean;
  codAvailable: boolean;
  publishedAt: string | null;
  tags: Array<{ refId: string; name: string; slug: string }>;
}
```

---

## 9. Recommended page flow

```
Category PLP mount
│
├─ Read categorySlug from route (e.g. /categories/derma-cat)
│
├─ GET /api/v1/public/products?categorySlug=derma-cat&page=1&limit=20
│   ├─ Render category.banner, category.image, ATF/BTF from response.category
│   ├─ Title: category.selectedCategory?.name ?? category.name
│   ├─ Breadcrumb: category.name → category.selectedCategory?.name
│   ├─ Render filter sidebar from category.categoryFilters
│   └─ Render product grid from data.data
│
├─ User selects filter value
│   └─ Re-fetch with categoryFilterRefId + categoryFilterValues (keep categorySlug)
│
├─ User changes page
│   └─ Re-fetch with same filters + new page
│
└─ User clears filters
    └─ GET with categorySlug only (no filter params)
```

---

## 10. Edge cases & notes

1. **`category` is `null`** when listing is not category-scoped (e.g. all products, brand-only filter).
2. **`selectedCategory` is `null`** when the URL slug is a root category.
3. **Empty filter result** — If a filter value is shown but no products have it assigned, the API returns `data: []` with `total: 0`. This is expected until products have filter bindings in admin.
4. **Signed URLs** — `image.url` and `banner.url` expire (~1 hour). Do not cache URLs long-term; refetch listing or use `key` if you have a separate CDN pattern.
5. **ATF / BTF** — HTML strings; render with your safe HTML component (same as product description).
6. **Category hierarchy** — Product filtering matches the selected category at **any** level (`category`, `subCategory`, `subSubCategory`, `subSubSubCategory` on the product).

---

## 11. Quick test URLs

Replace `{baseUrl}` with your API host (e.g. `https://cureka.techbv.in/api/v1` or local `http://localhost:3005/api/v1`).

```text
# Category PLP (child)
{baseUrl}/public/products?categorySlug=derma-cat&page=1&limit=20&sortOrder=ASC

# With skin type filter
{baseUrl}/public/products?categorySlug=derma-cat&categoryFilterRefId=SKI20265900&categoryFilterValues=Oily

# Root category
{baseUrl}/public/products?categorySlug=baby-care-derma&page=1&limit=20
```

---

## 12. Related APIs (not changed)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/public/products/:slug` | Product detail |
| `GET /api/v1/public/homepage/...` | Homepage category trees |
| `GET /api/v1/master/product-wizard/bootstrap` | Admin only — not for storefront |

---

## 13. Changelog summary

| Change | Description |
|--------|-------------|
| `category` on list response | Category banner, icon, ATF, BTF, and filters when `categorySlug` / `categoryRefId` is sent |
| Root metadata for child URLs | Child slug still filters products; `category` block uses root ancestor assets |
| `selectedCategory` | Identifies the child category from the URL |
| `categoryFilters[].values` | Product-bound facet values, with master fallback |
| Filter query params | `categoryFilterRefId` + `categoryFilterValues` or `categoryFilters` JSON |

---

**Questions?** Contact backend team with example slug/refId and full request URL if behavior does not match this doc.
