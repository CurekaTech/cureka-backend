# Product Free Delivery & Best Seller List Flag — UI Integration

Frontend handoff for two public API changes:

1. **`isFreeDelivery`** on product detail
2. **`bestSeller`** query flag + **`isBestSeller`** field on product list

**Base URL:** `/api/v1`
**Auth:** none (public)

---

## 1. Free delivery flag (product detail)

`GET /public/products/:slug`
(also `GET /public/products/shop/...` legacy paths)

The product detail response now includes a boolean **`isFreeDelivery`**.

```json
{
  "refId": "PRD20261234",
  "name": "Bakbone Tablets",
  "pricing": {
    "minSellingPrice": 799,
    "maxSellingPrice": 999
  },
  "isFreeDelivery": true
}
```

### Rule

```
isFreeDelivery = displayedSellingPrice > shipping_charge_threshold
```

- `shipping_charge_threshold` comes from **admin settings** (same value used at checkout for free shipping).
- **Displayed selling price** = the selected variant's `sellingPrice` when the detail is opened via a variant slug/URL; otherwise the preferred (lowest-price, in-stock) variant.
- Strictly greater than (`>`): if price **equals** the threshold, `isFreeDelivery` is `false`.

Example (threshold = `900`):

| Selling price | `isFreeDelivery` |
|---------------|------------------|
| 901 | `true` |
| 900 | `false` |
| 499 | `false` |

The value is computed live from admin settings, so changing the threshold in admin reflects immediately (no product cache clear needed).

### UI

- Show a "Free Delivery" badge on the product detail page when `isFreeDelivery === true`.

---

## 2. Best Seller list flag (product list)

`GET /public/products`

Pass **`bestSeller=true`** to keep the current filters but **pin bestseller products to the top**, ordered by the CMS Best Sellers index, followed by all other products.

```http
GET /api/v1/public/products?categorySlug=nutrition&bestSeller=true
```

Accepted values: `true` / `false` / `1` / `0` (omit for normal listing).

### Behavior

With `bestSeller=true` and any filters (e.g. category):

1. **Bestsellers first** — products carrying the `bestsellers` tag, in CMS index order (`sort_order` from Best Sellers Indexing screen).
2. **Then the rest** — remaining products matching the same filters, in the normal order.
3. Non-bestseller products are **not hidden** — they simply appear after the bestsellers.

> This is different from a "bestsellers only" listing. Here the full filtered catalog is returned, just re-prioritized.

### Card response

Each product card now includes **`isBestSeller`**:

```json
{
  "refId": "PRD20261234",
  "name": "Product name",
  "isBestSeller": true,
  "outOfStock": false,
  "pricing": { "minSellingPrice": 799, "maxSellingPrice": 999 }
}
```

### Where the UI should pass this flag

**Only from the Home page Best Sellers section → "View all" button.**

- Home page Best Sellers section shows category tabs + a few products per tab.
- The **"View all"** button should open the product listing for that category with `bestSeller=true`, so the customer first sees the indexed bestsellers, then the rest of that category's products.

Example "View all" target:

```
/products?categorySlug=<selected-tab-category>&bestSeller=true
```

Do **not** pass `bestSeller=true` on normal category/search browsing — only from the Best Sellers "View all" entry point.

### Optional: badge

You can also use `isBestSeller` to show a "Bestseller" badge on cards in any listing (independent of the `bestSeller` sort flag).

---

## Summary

| Change | Endpoint | Field / Param |
|--------|----------|---------------|
| Free delivery | `GET /public/products/:slug` | Response: `isFreeDelivery` (boolean) |
| Best seller sort | `GET /public/products` | Query: `bestSeller=true` |
| Best seller badge | `GET /public/products` | Response card: `isBestSeller` (boolean) |
