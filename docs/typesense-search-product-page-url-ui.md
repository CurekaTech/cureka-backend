# Typesense search — `productPageUrl` UI integration

Guide for frontend to wire **autocomplete / search dropdown** results to the correct product detail page and API.

Related: [product-page-url-ui-handoff.md](./product-page-url-ui-handoff.md) (product list + PDP rules).

---

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/public/search?q={query}&per_page=10` | Typesense search (products, brands, categories, …) |
| `GET /api/v1/public/search/popular?per_page=4` | Popular products |
| `GET /api/v1/public/products/...` | Product detail (slug **or** `/shop/...` path) |

---

## Product hit shape

When `entityType` is `"Product"`, each hit looks like:

```json
{
  "entityType": "Product",
  "title": "HealthEmate MT-101 AccuSure Thermometer",
  "slug": "healthemate-mt-101-accusure-thermometer",
  "refId": "SUN20260001",
  "variantId": "a1b2c3d4-…",
  "productPageUrl": "/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/"
}
```

| Field | Use |
|-------|-----|
| `productPageUrl` | Prefer for browser URL + detail API when not null |
| `slug` | Fallback when `productPageUrl` is null / missing |
| `title` | Display label in search UI |
| `variantId` | Optional — useful for add-to-cart later |
| `refId` | Product ref id |

Non-product hits (`Brand`, `Category`, `Health Concern`, …) keep existing navigation — only **Product** uses `productPageUrl`.

---

## Routing rule (same as product list)

| Condition | Browser / share URL | Detail API |
|-----------|---------------------|------------|
| `productPageUrl` is a non-empty string | Use **exactly** that value | `GET /api/v1/public/products` + `productPageUrl` |
| `productPageUrl` is `null` / missing / `""` | Your structured path from `slug` (e.g. `/shop/{slug}` or category-based) | `GET /api/v1/public/products/{slug}` |

Do **not** rebuild `/shop/...` when `productPageUrl` is present — use the DB/API value as-is (including trailing `/` if present).

---

## Integration steps

### 1. Read `productPageUrl` from search hits

```ts
type SearchHit = {
  entityType: string;
  title: string;
  slug: string;
  refId: string;
  variantId?: string;
  productPageUrl?: string | null;
};

function isProductHit(hit: SearchHit): boolean {
  return hit.entityType === 'Product';
}
```

### 2. Build href for the search suggestion

```ts
function getSearchProductHref(hit: SearchHit): string {
  if (!isProductHit(hit)) {
    // existing brand/category/health-concern routes
    return `/${hit.entityType.toLowerCase()}/${hit.slug}`;
  }

  if (hit.productPageUrl?.trim()) {
    return hit.productPageUrl.trim();
  }

  // fallback when productPageUrl is null
  return `/shop/${hit.slug}`;
}
```

### 3. On click → navigate + load PDP

```ts
function onSearchHitClick(hit: SearchHit) {
  if (!isProductHit(hit)) {
    // existing non-product navigation
    return;
  }

  const href = getSearchProductHref(hit);
  router.push(href);
}

async function fetchProductDetailFromPath(pathname: string, slugFallback?: string) {
  const apiBase = '/api/v1/public/products';

  // Legacy path from productPageUrl / browser URL
  if (pathname.startsWith('/shop/')) {
    const res = await fetch(`${apiBase}${pathname}`);
    if (res.ok) return res.json();
  }

  // Slug fallback
  if (slugFallback) {
    const res = await fetch(`${apiBase}/${encodeURIComponent(slugFallback)}`);
    if (res.ok) return res.json();
  }

  throw new Error('Product not found');
}
```

### 4. Detail API examples

**With `productPageUrl`:**

```http
GET /api/v1/public/products/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/
```

Browser URL:

```text
/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/
```

**Without `productPageUrl`:**

```http
GET /api/v1/public/products/healthemate-mt-101-accusure-thermometer
```

Browser URL (example fallback):

```text
/shop/healthemate-mt-101-accusure-thermometer
```

---

## End-to-end example

### Search

```http
GET /api/v1/public/search?q=thermometer&per_page=10
```

### Hit (migrated product)

```json
{
  "entityType": "Product",
  "title": "HealthEmate MT-101 AccuSure Thermometer",
  "slug": "some-internal-slug",
  "productPageUrl": "/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/"
}
```

UI should:

1. Show `title` in the dropdown  
2. Link to `productPageUrl`  
3. On PDP, call detail with that same `/shop/...` path  

### Hit (new product, no legacy URL)

```json
{
  "entityType": "Product",
  "title": "New Cureka Product",
  "slug": "new-cureka-product",
  "productPageUrl": null
}
```

UI should:

1. Link via slug-based URL  
2. Call `GET /api/v1/public/products/new-cureka-product`  

---

## Checklist

- [ ] Search dropdown uses `productPageUrl` when present  
- [ ] Search click navigates to exact `productPageUrl` (no rebuild)  
- [ ] PDP detail API uses `/public/products` + `productPageUrl` when path is `/shop/...`  
- [ ] When `productPageUrl` is null → navigate + detail by `slug`  
- [ ] Brands / categories / health concerns unchanged  
- [ ] After backend deploy, confirm Typesense reindex so older products also return `productPageUrl`:

```bash
npm run typesense:reindex
```

Until reindex, some hits may still have `productPageUrl: null` even if the DB already has the value — UI must keep the slug fallback.

---

## Notes

- `productPageUrl` is path-only (e.g. `/shop/.../`), not `https://www.cureka.com/...`.  
- Trailing slash: keep whatever the API returns.  
- Popular search (`/public/search/popular`) uses the same hit shape — apply the same rule.  
- Product list cards use the same field; keep one shared helper for list + search if possible.
