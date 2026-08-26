# Category Product Indexing — Admin Panel Integration

Screen: **CMS → Category Product Indexing** (`/cms/category-product-indexing`)

Goal: One product list with checkboxes. Admin filters by category when needed, marks Top Products (`is_top`), and saves. Already-Top rows appear at the top of the list.

Website category PLP uses this automatically — no separate website config.

---

## Recommended UI flow

```
1. Open Category Product Indexing
2. See a product list (published products)
3. Optionally filter by category / search by SKU or name
4. Already–Top products appear at the top (checkbox ON)
5. Check / uncheck products
6. Click Save
```

### How admin sees current Top Products

Same list — no separate “selected category” screen:

- Rows with `isTop: true` are sorted to the **top** (`prioritizeTop=true`)
- Checkbox is **checked** for those rows
- Optional badge: “Top”

---

## Permissions

| Permission | When |
|------------|------|
| `category_product.read` | Open page / load list |
| `category_product.update` | Save |

---

## Product list (main screen)

Reuse the existing admin products API (do **not** create a new product-search API).

```http
GET /api/v1/products
  ?status=published
  &prioritizeTop=true
  &page=1
  &limit=20
  &categoryRefId={optional}
  &search={optionalSkuOrName}
```

| Query | Why |
|-------|-----|
| `status=published` | Live catalog only |
| `prioritizeTop=true` | Already–Top variants appear first |
| `categoryRefId` | Optional filter — any hierarchy level |
| `search` | Optional SKU / name / slug search |
| `page` / `limit` | Pagination |

### Category filter (optional)

Reuse existing category APIs for the filter dropdown only:

| Purpose | API |
|---------|-----|
| Flat / searchable list | `GET /api/v1/master/categories` |
| Tree picker | `GET /api/v1/master/categories/tree` |

When the admin picks a category in the filter, reload products with that `categoryRefId`. Clearing the filter loads all published products again.

Hierarchy is only for label text in the filter UI if useful:

| `hierarchyLevel` | Label |
|------------------|--------|
| `0` | Main Category |
| `1` | Sub Category |
| `2` | Sub-Sub Category |
| `3` | Sub-Sub-Sub Category |

### Row model

List is **variant-row** based. Each item is one product with typically one variant in `variants[]`.

| Field | Use in UI |
|-------|-----------|
| `variants[0].id` | Checkbox value / save payload (`variantIds`) |
| `variants[0].isTop` | Initial checkbox state (`true` → checked) |
| `variants[0].sku` | Show SKU |
| `variants[0].status` | Prefer only `active` rows (hide/disable inactive) |
| `name` / `slug` | Display title |
| category fields on product | Optional display column |

### Checkbox behaviour

1. On load: `checked = variants[0].isTop === true`
2. Keep a local `Set` of checked `variantId`s across search / filters / pagination
3. Check → add id; uncheck → remove id
4. Do **not** wipe selections when changing page or search — merge into the working set

### Optional: Top-only chip

```http
GET /api/v1/products?status=published&isTop=true&prioritizeTop=true
```

Default view should show the normal published list with Tops pinned first.

---

## Save

Save updates Top flags for the variants the admin has checked.

```http
PUT /api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products
Content-Type: application/json

{
  "variantIds": [
    "uuid-of-checked-variant-1",
    "uuid-of-checked-variant-2"
  ]
}
```

### Which `categoryRefId` to use on Save

The save endpoint is **category-scoped** (so clearing tops does not wipe unrelated categories):

| Situation | What to send |
|-----------|----------------|
| Admin applied a category filter | Use that filter’s `categoryRefId` |
| No category filter | Require the admin to pick a category before Save, **or** save only after a category filter is set |

Recommended UX: **category filter required before Save** (list can still load without it for browsing; Save is disabled until a category is chosen). That keeps “deselected = clear tops in this category” safe.

| Case | Effect |
|------|--------|
| Id in `variantIds` | `is_top = true` |
| Was top in this category, not in payload | `is_top = false` |
| Variant outside this category | **Unchanged** |
| `variantIds: []` | Clears all tops for **this** category only |

After success: toast + re-fetch the list.

### Building the payload

Send **all checked variant IDs** that belong to the save category (not only the current page):

- Seed from server `isTop` after load (for that category filter)
- Apply user check/uncheck across pages
- On Save → `Array.from(selectedVariantIds)`

---

## Suggested page layout

```
[ Category filter ▾ ]   [ Search SKU / name… ]              [ Save ]

☑  SKU-001  Product A          Top
☑  SKU-002  Product B          Top
☐  SKU-003  Product C
☐  SKU-004  Product D
…
```

No mandatory “select category → then open products” wizard. Just the list + filters.

---

## API cheat sheet

| Action | Method | Path |
|--------|--------|------|
| Product list (Tops on top) | GET | `/api/v1/products?status=published&prioritizeTop=true` |
| Optional category filter | GET | same + `&categoryRefId=` |
| Optional Top-only filter | GET | same + `&isTop=true` |
| Category filter options | GET | `/api/v1/master/categories` or `…/tree` |
| Save selection | PUT | `/api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products` |

Optional compact “current tops for a category” (not needed if the grid uses `isTop` + checkboxes):

```http
GET /api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products
```

---

## Do / Don’t

**Do**

- One product list, filterable by category / search
- Use `prioritizeTop=true` so current Tops sit at the top
- Drive checkbox from `variants[0].isTop`
- Save with full checked `variantIds` for the chosen category

**Don’t**

- Force a category-first wizard before showing products
- Create new category-list or product-search APIs
- Save only the current page’s checked rows
- Clear tops in other categories when saving one category
