# Frequently Bought Together — Frontend Integration Guide

Products that complement what is already in the cart, from **different but related categories**.

**Base URL:** `/api/v1`  
**Auth:** none required (public endpoint)

---

## Endpoint

```
GET /api/v1/public/products/frequently-bought-together
```

### Query parameters

| Parameter | Type | Required | Default | Notes |
|-----------|------|----------|---------|-------|
| `variantIds` | `string` | ✅ | — | Comma-separated variant UUIDs currently in the cart. Max 20. |
| `page` | `number` | ❌ | `1` | Page number (min 1) |
| `limit` | `number` | ❌ | `10` | Results per page (min 1, max 20) |

### Example request

```http
GET /api/v1/public/products/frequently-bought-together?variantIds=11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222&page=1&limit=10
```

---

## Response shape

Same paginated shape as `/you-may-also-like`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Frequently bought together products retrieved successfully",
  "data": {
    "items": [
      {
        "id": "...",
        "refId": "PROD...",
        "name": "Creatine Monohydrate 300g",
        "slug": "/shop/supplements/creatine-monohydrate-300g",
        "variants": [...],
        "media": [...],
        "category": { "id": "...", "name": "Creatine", "slug": "creatine" },
        "brand": { "id": "...", "name": "MuscleBlaze" },
        "sellingPrice": 699,
        "mrp": 999,
        "discountPercent": 30,
        "inStock": true
      }
    ],
    "total": 48,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Recommendation logic

### Core algorithm

1. Accepts the **cart's variant IDs**.
2. Resolves each variant's **deepest category** (sub-category preferred over root category).
3. Matches those category names against ~50 predefined **cross-category rules** (e.g. "if cart has Protein Powder → recommend Creatine, Multivitamin, Protein Bars").
4. Looks up the matched **target category IDs** from the DB (case-insensitive name matching).
5. Excludes **source categories** (won't recommend more of what's already in the cart).
6. Excludes **cart products** (won't re-suggest products already added).
7. Applies a **±35% price band** around the average cart item price.
8. Sorts by **bestseller rank** (bestseller items appear first).
9. **Fallback**: on page 1, if results are fewer than half the requested limit, the price band is removed and the full complementary category set is returned.

### Key difference from "You May Also Like"

| Feature | You May Also Like | Frequently Bought Together |
|---------|-------------------|---------------------------|
| Category logic | **Same** sub-category | **Different / complementary** categories |
| Purpose | "More like this" | "Complete your routine / kit" |
| Limit | Up to 40/page | Up to 20/page |
| Price range | ±35% avg | ±35% avg (same) |

### Rule examples

| Cart item category | FBT suggestions |
|--------------------|-----------------|
| Protein Powder | Creatine, Multivitamin, Protein Bars |
| Iron Supplement | Vitamin C, Folic Acid, Vitamin B12 |
| Face Wash | Sunscreen, Moisturiser, Face Serum |
| Knee Support | Joint Supplements, Heating Pad, Pain Relief Gel |
| Glucometer | Diabetic Supplements, Diabetic Foot Care, Sugar-Free Nutrition |
| Baby Shampoo | Baby Wash, Baby Lotion |
| Shampoo | Conditioner, Hair Serum, Hair Supplements |
| Immunity Supplement | Zinc, Vitamin C, Probiotics |
| Blood Pressure Monitor | Heart Health Supplements, Omega-3 |

> Full rule set is in `modules/public/config/fbt-category-mapping.config.ts`.

### Manual overrides (upcoming)

The system is designed to support admin-configured manual overrides. When implemented, manually curated recommendations will always take priority over the automatic category-matching rules.

---

## Empty / fallback behaviour

| Situation | What happens |
|-----------|-------------|
| `variantIds` not found in DB | Returns empty list `{ items: [], total: 0 }` |
| No matching FBT rules for the cart's categories | Returns empty list |
| Matching categories found but no products within price band | Retries without price band (page 1 only) |
| Still no products | Returns empty list |

---

## Usage in the UI

### Recommended placement

- **Cart page / drawer** — below cart items, before checkout CTA
- **Product detail page** — below the main product, above "You May Also Like"

### Suggested UI copy

> **"Frequently Bought Together"** or **"Complete Your Routine"**

### Implementation example

```ts
// 1. Collect variant IDs from the current cart
const variantIds = cart.items.map((item) => item.variantId);

// 2. Fetch FBT products
const response = await fetch(
  `/api/v1/public/products/frequently-bought-together?variantIds=${variantIds.join(',')}&limit=10`,
  { credentials: 'include' }
);
const { data } = await response.json();

// 3. Render data.items as product cards
```

### Pagination

Use `page` and `limit` params to load more. Check `data.hasNextPage` to show/hide a "See more" button.

```ts
// Page 2
GET /api/v1/public/products/frequently-bought-together?variantIds=...&page=2&limit=10
```

---

## Error cases

| Status | Reason |
|--------|--------|
| `400` | `variantIds` missing, invalid UUID, or array exceeds 20 items |
| `200` (empty) | No matching rules / no in-stock products in target categories |
