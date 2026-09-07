# Product listing — faceted filters (website integration)

Public APIs for the **product listing page (PLP)** sidebar. No auth. Same base URL and headers as other public product APIs (`/api/v1`).

Use **exactly these 3 APIs** on the product listing page:

| # | Method | Path | When to call |
|---|---|---|---|
| 1 | `GET` | `/public/products` | Every PLP load and every sidebar change — product cards |
| 2 | `GET` | `/public/products/filters` | Same time as #1 (except brand typeahead / load-more) — sidebar |
| 3 | `GET` | `/public/products/filters/brands` | Brand search box and “load more” brands |

Health concern, wellness goal, search, brand, and category **landing pages** still use their existing homepage/master APIs. After the user clicks through, redirect to the PLP with locked query params, then use only the 3 APIs above.

---

## Sidebar contents

The filters API returns **only**:

1. **Categories** — nested tree (`children` under each parent)
2. **Brands** — applicable brands, searchable, cursor-paginated
3. **Price** — `min` / `max` from the current product set
4. **Category-filters** — Preference, Formulation, Age Group, Gender, Hair Type, Skin Type, etc.

Do **not** render Health Concerns or Wellness Goals in the sidebar. Those are listing context from the page the user came from.

---

## Page → `contextType` + locked params

Set `contextType` from how the user arrived. Keep the locked params on **every** products + filters request. Sidebar picks are extra params.

| User arrived from | `contextType` | Locked params (always send) |
|---|---|---|
| Category URL `/product-category/hair-care` | `category` | `categorySlug=hair-care` |
| Nested category | `category` | `categorySlug` of that node |
| Brand page | `brand` | `brandSlug` (single) |
| Search results | `search` | `search=shampoo` |
| Health concern page (redirect) | `healthConcern` | `healthConcernSlug` |
| Wellness goal page (redirect) | `wellnessGoal` | `wellnessGoalRefId` |
| Bestsellers view-all | `tag` | `tagSlug=bestsellers` |
| Combined landing | `mixed` | plus optional `lockedFacets=category,healthConcern` |

`contextType` is required on the filter APIs. If omitted, the API infers it from the params.

---

## Shared query params

Send the same listing params on APIs **1, 2, and 3**.

| Param | Source |
|---|---|
| `contextType` | From the table above (filter APIs) |
| `lockedFacets` | Optional override for `mixed` |
| `categorySlug` / `categoryRefId` | Locked category and/or sidebar category pick |
| `brandSlug` | Comma-separated multi-select (`xyz,abc`). Brand page uses one slug. |
| `brandRefId` | Single brand |
| `search` | Product search text. **Not** brand typeahead. |
| `healthConcernSlug` / `healthConcernRefId` | Locked from HC redirect |
| `wellnessGoalRefId` | Locked from WG redirect |
| `tagSlug` | Locked from bestsellers |
| `categoryFilters` | JSON string of `{ categoryFilterRefId, values[] }[]` |
| `minPrice` / `maxPrice` or `priceRange` | Sidebar price |
| `page` / `limit` / `sortBy` / `sortOrder` | Products API (#1) only |

Filter-only params:

| Param | API | Purpose |
|---|---|---|
| `facetSearch` | `/filters/brands` | Search brand **names** among applicable brands |
| `cursor` | `/filters/brands` or `facet=categories` | Next page |
| `limit` | `/filters` and `/filters/brands` | Default `20`, max `100` |
| `facet` | `/filters` | Optional: `brands` \| `categories` \| `categoryFilters` \| `price` |

**`search` = product listing search. `facetSearch` = type inside the brand filter box.**

---

## Parallel fetch on PLP mount / filter change

```ts
const listing = new URLSearchParams();
listing.set('healthConcernSlug', 'hair-fall');
listing.set('page', '1');
listing.set('limit', '20');
if (categorySlug) listing.set('categorySlug', categorySlug);
if (brandSlugs.length) listing.set('brandSlug', brandSlugs.join(','));
if (categoryFilterBindings.length) {
  listing.set('categoryFilters', JSON.stringify(categoryFilterBindings));
}
if (minPrice != null) listing.set('minPrice', String(minPrice));
if (maxPrice != null) listing.set('maxPrice', String(maxPrice));

const filters = new URLSearchParams(listing);
filters.set('contextType', 'healthConcern');
filters.delete('page');
filters.delete('sortBy');
filters.delete('sortOrder');

await Promise.all([
  fetch(`/api/v1/public/products?${listing}`),
  fetch(`/api/v1/public/products/filters?${filters}`),
]);
```

On brand typeahead / load more, do **not** refetch all filters. Call `/public/products/filters/brands` with the same locked + selected params + `facetSearch` + `cursor`.

---

## Response → sidebar UI

### `GET /public/products/filters`

```json
{
  "success": true,
  "data": {
    "contextType": "healthConcern",
    "categories": {
      "items": [
        {
          "id": "uuid",
          "refId": "CAT…",
          "name": "Hair Care",
          "slug": "hair-care",
          "slugPath": ["hair-care"],
          "permalink": "/product-category/hair-care",
          "position": 1,
          "hierarchyLevel": 0,
          "type": "CATEGORY",
          "productCount": 40,
          "selected": false,
          "children": [
            {
              "id": "uuid",
              "refId": "CAT…",
              "name": "Shampoo",
              "slug": "shampoo",
              "slugPath": ["hair-care", "shampoo"],
              "permalink": "/product-category/hair-care/shampoo",
              "hierarchyLevel": 1,
              "type": "SUB_CATEGORY",
              "productCount": 12,
              "selected": false,
              "children": []
            }
          ]
        }
      ],
      "selectedItems": [],
      "nextCursor": null,
      "hasMore": false,
      "limit": 20
    },
    "brands": {
      "items": [
        {
          "id": "uuid",
          "refId": "BRA…",
          "name": "XYZ",
          "slug": "xyz",
          "productCount": 8,
          "selected": false
        }
      ],
      "selectedItems": [],
      "nextCursor": null,
      "hasMore": false,
      "limit": 20
    },
    "priceRange": { "min": 199, "max": 4999 },
    "filters": [
      {
        "id": "AGE20269862",
        "name": "Age Group",
        "type": "checkbox",
        "items": [
          { "id": "Adults", "name": "Adults", "productCount": 12, "selected": true }
        ]
      }
    ]
  }
}
```

There are **no** `healthConcerns` / `wellnessGoals` keys.

### Categories

- Render `categories.items` as a tree using `children[]`.
- Filter products with `categorySlug` of the clicked node (or `permalink` for navigation).
- `hierarchyLevel`: `0` CATEGORY, `1` SUB_CATEGORY, `2` SUB_SUB_CATEGORY, `3` SUB_SUB_SUB_CATEGORY.
- Merge `selectedItems` if a selected node is not in the current page.

### Brands

- Checkboxes from `brands.items`.
- Always keep `brands.selectedItems` visible (selected brand may be off the current cursor page).
- Search: `GET /public/products/filters/brands?...&facetSearch=abc`.
- Load more: pass `brands.nextCursor` while `hasMore` is true.
- Multi-select: `brandSlug=xyz,abc` (OR within brands).

### Price

- Slider bounds = `priceRange.min` / `priceRange.max`.
- User selection = `minPrice` / `maxPrice`.
- Bounds ignore the selected price so the slider does not collapse to the chosen range.
- If both are `null`, there are no priced products in this context.

### Category-filters

- One checkbox group per `filters[]` (`name`, `type: checkbox`).
- Apply with existing `categoryFilters` JSON:

```json
[
  { "categoryFilterRefId": "AGE20269862", "values": ["Adults"] },
  { "categoryFilterRefId": "FOR20267492", "values": ["Tablets", "Cream"] }
]
```

- Hide a group when `items` is empty and nothing is selected.
- Use `filters[].id` as `categoryFilterRefId`.

---

## Filter logic (do not change)

| Within one group | Across groups |
|---|---|
| Brands: OR (`brandSlug=a,b`) | AND |
| Category-filter values: OR | AND with other groups |
| Category: single slug | AND |

Changing any sidebar control: refetch **products** (#1) and **filters** (#2) with the new params so other groups shrink correctly.

---

## Selected + empty results

If products `total` is `0`:

- Do **not** load global brands/categories from `/public/masters`.
- Keep selected chips from `selectedItems` / current query so the user can uncheck.

Selected options may have `productCount: 0` so they stay visible to remove.

---

## Brand load-more response

`GET /public/products/filters/brands` returns the brands page only (same shape as `data.brands` above):

```json
{
  "success": true,
  "data": {
    "items": [],
    "selectedItems": [],
    "nextCursor": "eyJpZCI6Ii4uLiIsInNvcnRWYWx1ZSI6IkFiYyJ9",
    "hasMore": true,
    "limit": 20
  }
}
```

---

## Do not use for the PLP sidebar

| API | Use instead |
|---|---|
| `GET /public/masters?type=brand` | `#2` / `#3` |
| `GET /public/masters?type=category` | `#2` `categories` |
| `GET /public/homepage/health-concerns` | Landing only, then redirect |
| `GET /public/homepage/wellness-goals` | Landing only, then redirect |
| `GET /public/homepage/brands` | Landing / view-all only |
| `GET /public/products/filters/categories` | Legacy brand-only list; use `#2` |
| `GET /public/search` | Autocomplete only; PLP uses `#1` + `#2` |
| `data.category.categoryFilters` on `#1` | Legacy; use `#2` `filters` |

Landing pages **before** redirect still use homepage/header/search APIs as today.

---

## cURL examples

```bash
# Health concern redirect → sidebar
curl -s 'http://localhost:3000/api/v1/public/products/filters?contextType=healthConcern&healthConcernSlug=hair-fall'

# Same listing
curl -s 'http://localhost:3000/api/v1/public/products?healthConcernSlug=hair-fall&page=1&limit=20'

# Category page + brand + category-filter
curl -s 'http://localhost:3000/api/v1/public/products/filters?contextType=category&categorySlug=hair-care&brandSlug=xyz&categoryFilters=[{"categoryFilterRefId":"AGE20269862","values":["Adults"]}]'

# Brand search among applicable brands
curl -s 'http://localhost:3000/api/v1/public/products/filters/brands?contextType=category&categorySlug=hair-care&facetSearch=abc&limit=20'

# Search results
curl -s 'http://localhost:3000/api/v1/public/products/filters?contextType=search&search=shampoo'
```

---

## Related docs (legacy)

- [product-list-category-filters-ui-integration.md](./product-list-category-filters-ui-integration.md) — how to send `categoryFilters` on the product list
- [brand-category-filters-website-integration.md](./brand-category-filters-website-integration.md) — old brand-only category facet API
