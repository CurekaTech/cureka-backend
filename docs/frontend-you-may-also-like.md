# You May Also Like — Frontend Integration Guide

This API returns a paginated list of similar products based on the variant IDs from the customer's cart (or a product detail page). It is designed for the **"You May Also Like"** section.

---

## Endpoint

```
GET /api/v1/public/products/you-may-also-like
```

No authentication required.

---

## Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `variantIds` | string | Yes | — | Comma-separated list of variant UUIDs (from cart or viewed product). Max 50 IDs. |
| `page` | number | No | `1` | Page number |
| `limit` | number | No | `20` | Results per page. Max `40`. |

---

## How to get `variantIds`

Pass the `variantId` of each item currently in the customer's cart. These are available from the cart API response (`cart.items[].variantId`).

You can also pass the variant ID of the product currently being viewed (on the product detail page).

---

## Example requests

```
# Cart has two items
GET /api/v1/public/products/you-may-also-like?variantIds=550e8400-e29b-41d4-a716-446655440000,6ba7b810-9dad-11d1-80b4-00c04fd430c8&page=1&limit=20

# Product detail page — single variant
GET /api/v1/public/products/you-may-also-like?variantIds=550e8400-e29b-41d4-a716-446655440000&page=1&limit=20

# Load more (next page)
GET /api/v1/public/products/you-may-also-like?variantIds=550e8400-e29b-41d4-a716-446655440000&page=2&limit=20
```

---

## Response

```json
{
  "success": true,
  "message": "You may also like products retrieved successfully",
  "data": {
    "data": [ /* ProductCard[] — see shape below */ ],
    "total": 84,
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## Product card shape (`data.data[]`)

```ts
{
  // Identifiers
  id: string;                        // Product UUID
  refId: string;                     // e.g. "SUN20261234"
  name: string;                      // Product display name
  slug: string;                      // Product slug (for routing)

  // Routing
  permalink: string;                 // Full canonical path, e.g. "/shop/skin-care/face-wash/gentle-face-wash/gentle-face-wash-150ml"
  productPageUrl: string | null;     // Legacy product_page_url if available (prefer over permalink)

  // Category
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subCategoryName: string | null;
  categorySlugPath: string[];        // e.g. ["skin-care", "face-wash"]

  // Brand
  brandRefId: string | null;
  brandName: string | null;
  brandSlug: string | null;

  // Variant for add-to-cart
  variantId: string | null;          // Primary list variant UUID — pass this to add-to-cart
  defaultVariantId: string | null;   // Same as variantId in most cases

  // Image
  primaryImageUrl: {
    key: string;                     // Storage key
    url: string;                     // Ready-to-use CDN URL — use this directly in <img>
  } | null;

  // Pricing
  pricing: {
    minSellingPrice: number;         // Lowest selling price across variants
    maxSellingPrice: number;         // Highest selling price across variants
    minMrp: number;                  // MRP for strike-through display
    maxDiscountPercentage: number | null;  // e.g. 20 (%)
    inStock: boolean;                // Whether at least one variant is in stock
  };

  // Flags
  outOfStock: boolean;               // True when the list variant is marked OOS
  isBestSeller: boolean;             // True when product has "bestsellers" tag
  codAvailable: boolean;
  subscriptionEnabled: boolean;
  productType: string;               // "SIMPLE" | "VARIABLE" | "BUNDLE"

  // Tags
  tags: Array<{
    refId: string;
    name: string;
    slug: string;
  }>;

  publishedAt: string | null;
}
```

---

## Recommendation logic

The API applies the following ranking internally — no configuration needed from the frontend:

1. **Sub-category match first** — if the cart contains a Face Wash (sub-category), results show other Face Washes before general Skin Care products.
2. **Price band** — results are within ±35% of the average price of the input variants.
3. **Bestseller rank** — within each match tier, products tagged as bestsellers are ranked first.
4. **Cart products excluded** — products already in the cart are never returned.
5. **Fallback** — if fewer than 10 results are found with the price band (page 1 only), the price filter is automatically relaxed and more results are returned.

---

## Usage patterns

### Cart page — "You may also like" section

```ts
// Get variant IDs from your cart state
const variantIds = cart.items.map(item => item.variantId).join(',');

fetch(`/api/v1/public/products/you-may-also-like?variantIds=${variantIds}&page=1&limit=20`)
```

### Product detail page — "Similar products"

```ts
// Pass only the currently viewed variant
fetch(`/api/v1/public/products/you-may-also-like?variantIds=${currentVariantId}&page=1&limit=20`)
```

### Load more / pagination

```ts
// Increment page — keep the same variantIds on every page request
fetch(`/api/v1/public/products/you-may-also-like?variantIds=${variantIds}&page=2&limit=20`)
```

> Important: pass the same `variantIds` on every page request. The backend resolves category context from the variant IDs on each call.

---

## Edge cases

| Scenario | Behaviour |
|---|---|
| `variantIds` contains IDs not found in DB | Those IDs are silently ignored |
| All input variants belong to the same sub-category | Results are all from that one sub-category |
| Input variants span multiple sub-categories | Results are drawn from all those sub-categories (OR match) |
| Cart is empty / no valid variant IDs | Returns `{ data: [], total: 0, totalPages: 0, hasNextPage: false }` |
| Price band returns too few results | Automatically relaxed on page 1 |
| `page` beyond `totalPages` | Returns empty `data` array with correct `total` |

---

## Notes

- `primaryImageUrl.url` is a pre-signed CDN URL — use it directly in `<img src="...">`.
- For add-to-cart use `variantId` (the primary list variant). Do not use `defaultVariantId` separately — they are the same value.
- `permalink` and `productPageUrl` — prefer `productPageUrl` when non-null (it is the SEO-friendly legacy path). Fall back to `permalink`.
- Discount badge: compute from `pricing.minMrp` and `pricing.minSellingPrice`, or use `pricing.maxDiscountPercentage` directly.
