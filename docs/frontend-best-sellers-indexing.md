# Best Sellers Indexing — Admin CMS Integration

Membership stays on the product tag slug **`bestsellers`** (product create/update / approve).  
This CMS page only controls **display order** for homepage Best Sellers tabs and products.

Route (already in sidebar): `/cms/best-sellers-indexing`  
Permission: `best_sellers.read` (list) / `best_sellers.update` (reorder)

---

## APIs

Base path: `/admin/best-sellers`  
Auth: admin JWT + role + permissions

### 1. List bestseller categories (tabs)

`GET /admin/best-sellers/categories`

Returns root categories that have ≥1 product with the `bestsellers` tag, ordered by `bestsellerSortIndex ASC` (nulls last), then name.

```json
[
  {
    "refId": "HEA20260016",
    "name": "Health Care",
    "slug": "health-care",
    "bestsellerSortIndex": 1,
    "productCount": 4
  }
]
```

### 2. Reorder category tabs

`PATCH /admin/best-sellers/categories/reorder`

```json
{
  "categories": [
    { "refId": "HEA20260016", "position": 1 },
    { "refId": "BEA20260001", "position": 2 }
  ]
}
```

- `position` starts at **1**
- All refIds must be current bestseller categories
- Response: updated category list (same shape as GET)

### 3. List products in a category

`GET /admin/best-sellers/categories/:categoryRefId/products`

```json
[
  {
    "refId": "PRO20261234",
    "name": "Product name",
    "slug": "product-name",
    "status": "published",
    "sortOrder": 1,
    "primaryImageUrl": { "key": "...", "name": "...", "url": "https://..." }
  }
]
```

Ordered by `sortOrder ASC`, then name.

### 4. Reorder products in a category

`PATCH /admin/best-sellers/categories/:categoryRefId/products/reorder`

```json
{
  "products": [
    { "refId": "PRO20261234", "position": 1 },
    { "refId": "PRO20265678", "position": 2 }
  ]
}
```

- Products must already carry the `bestsellers` tag in that category
- Response: updated product list

---

## Suggested UI

Two-pane layout:

1. **Left:** draggable category list (`name`, `productCount`, index)
2. **Right:** after selecting a category, draggable product list (thumbnail, name, refId, status, index)
3. On drop / Save: call the matching `PATCH .../reorder` with 1-based positions from the new array order
4. Empty state: “No products tagged Bestsellers” → link to product edit (tags)
5. Note on page: membership is managed via product tags, not on this screen

Homepage public payload is unchanged (`categories[].index` + `products[]` array order). Backend now fills it from these indexes (max **10** tabs × **5** products).

---

## Checklist

- [ ] Gate page with `best_sellers.read`
- [ ] Disable reorder controls without `best_sellers.update`
- [ ] Category DnD → `PATCH /admin/best-sellers/categories/reorder`
- [ ] Product DnD → `PATCH /admin/best-sellers/categories/:categoryRefId/products/reorder`
- [ ] Refresh lists after save; show API error toasts
- [ ] Confirm storefront homepage Best Sellers tabs/cards follow CMS order after reorder
