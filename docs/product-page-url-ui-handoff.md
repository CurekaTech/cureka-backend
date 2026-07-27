# Product page URL — UI / frontend handoff

Related: [typesense-search-product-page-url-ui.md](./typesense-search-product-page-url-ui.md) (Typesense / autocomplete search).

How the storefront should build product links and call the public product detail API when `productPageUrl` is present vs when it is null.

**Base API:** `https://<API_HOST>/api/v1/public/products`

---

## Rule (summary)

| List field | Browser / share URL | Detail API call |
|------------|---------------------|-----------------|
| `productPageUrl` is a non-empty string | Use **exactly** that path (same as DB) | `GET /public/products{productPageUrl}` |
| `productPageUrl` is `null` | Build from slug structure (see below) | `GET /public/products/{slug}` |

Do **not** invent a different path when `productPageUrl` exists — use the DB value as-is.

---

## 1. List / search response fields

### `GET /public/products` (card)

Relevant fields on each item:

```json
{
  "slug": "healthemate-mt-101-accusure-thermometer",
  "categorySlugPath": ["healthcare-devices", "medical-equipments", "thermometer"],
  "permalink": "/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/",
  "productPageUrl": "/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/"
}
```

| Field | Meaning |
|-------|---------|
| `productPageUrl` | Legacy path stored on the variant (`/shop/.../`). Prefer this for routing when not null. |
| `permalink` | Backend convenience link. When `productPageUrl` exists, it usually matches it; when null, it is built from category + slug. |
| `slug` | Product slug — use for detail API only when `productPageUrl` is null. |
| `categorySlugPath` | Category slugs root → leaf — use to build UI URL when `productPageUrl` is null. |

### `GET /public/products/search`

Each row also includes:

- `productSlug`
- `variantSlug`
- `productPageUrl`

Same rule: if `productPageUrl` is set, use it for both UI URL and detail API.

---

## 2. When `productPageUrl` is present

### Display / router path

Use the value **as stored** (keep leading `/` and trailing `/` if present):

```text
/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/
```

Example Next.js / React Router style:

```ts
const href = product.productPageUrl; // do not rebuild
```

### Detail API

Append the path (without duplicating `/public/products` incorrectly):

```http
GET /api/v1/public/products/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/
```

Helper:

```ts
function getProductDetailApiUrl(product: {
  productPageUrl?: string | null;
  slug: string;
}): string {
  const base = '/api/v1/public/products';

  if (product.productPageUrl?.trim()) {
    // productPageUrl already starts with /shop/...
    // → /api/v1/public/products/shop/...
    return `${base}${product.productPageUrl}`;
  }

  return `${base}/${encodeURIComponent(product.slug)}`;
}
```

**Important:** strip only a leading origin if the UI ever receives a full URL (`https://www.cureka.com/shop/...`). The API expects the path part starting at `shop/...` after `/public/products/`. DB values are already path-only (`/shop/.../`).

---

## 3. When `productPageUrl` is null

### Display / router path (structured UI URL)

Build from category path + product slug (same idea as backend `permalink`):

```text
/shop/{categorySlugPath joined by /}/{slug}
```

Example:

```ts
function buildFallbackProductHref(product: {
  slug: string;
  categorySlugPath?: string[];
  permalink?: string;
}): string {
  // Prefer backend permalink when productPageUrl is null
  if (product.permalink?.trim()) {
    return product.permalink;
  }

  const parts = (product.categorySlugPath ?? []).filter(Boolean);
  if (parts.length) {
    return `/shop/${parts.join('/')}/${product.slug}`;
  }

  return `/shop/${product.slug}`;
}
```

### Detail API

```http
GET /api/v1/public/products/{slug}
```

Example:

```http
GET /api/v1/public/products/healthemate-mt-101-accusure-thermometer
```

---

## 4. Recommended click handler (list → PDP)

```ts
type ListProduct = {
  slug: string;
  productPageUrl?: string | null;
  permalink?: string | null;
  categorySlugPath?: string[];
};

function onProductClick(product: ListProduct) {
  if (product.productPageUrl?.trim()) {
    // 1) Navigate browser to DB path
    router.push(product.productPageUrl);
    // 2) Load details with the same path via API
    // GET /api/v1/public/products + productPageUrl
    return;
  }

  // Fallback: structured UI URL + slug detail API
  const href = product.permalink?.trim() || buildFallbackProductHref(product);
  router.push(href);
  // GET /api/v1/public/products/{slug}
}
```

On the PDP page, prefer reading the current path:

- If path starts with `/shop/` and has multiple segments → call  
  `GET /api/v1/public/products` + current path (e.g. `/shop/a/b/c/name/`)
- Else → call  
  `GET /api/v1/public/products/{slug}`

```ts
async function loadProductDetail(pathname: string, slugParam?: string) {
  const apiBase = '/api/v1/public/products';

  if (pathname.startsWith('/shop/')) {
    const res = await fetch(`${apiBase}${pathname}`);
    if (res.ok) return res.json();
  }

  if (slugParam) {
    const res = await fetch(`${apiBase}/${encodeURIComponent(slugParam)}`);
    if (res.ok) return res.json();
  }

  throw new Error('Product not found');
}
```

---

## 4b. Typesense / public search (`GET /public/search`)

Search hits for products now include the same field:

```json
{
  "entityType": "Product",
  "title": "HealthEmate MT-101 AccuSure Thermometer",
  "slug": "healthemate-mt-101-accusure-thermometer",
  "refId": "SUN…",
  "variantId": "…",
  "productPageUrl": "/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/"
}
```

Apply the **same routing rule** as list cards:

| Search hit | Browser URL | Detail API |
|------------|-------------|------------|
| `productPageUrl` set | use `productPageUrl` exactly | `GET /public/products` + `productPageUrl` |
| `productPageUrl` null / missing | use `slug` (structured UI path if you build one) | `GET /public/products/{slug}` |

```ts
function onSearchResultClick(hit: {
  entityType: string;
  slug: string;
  productPageUrl?: string | null;
}) {
  if (hit.entityType !== 'Product') {
    // brands / categories / health concerns — existing behavior
    return;
  }

  if (hit.productPageUrl?.trim()) {
    router.push(hit.productPageUrl);
    return;
  }

  router.push(`/shop/${hit.slug}`); // or your structured fallback
}
```

**Note for deploy:** after backend ships this field, run Typesense reindex so existing documents get `productPageUrl`:

```bash
npm run typesense:reindex
```

Until reindex, older indexed products may return `productPageUrl: null` even if DB already has the value.

---

## 5. Detail response notes

`GET` detail (by slug **or** by `/shop/...` path) returns the full product payload.

Variants include `productPageUrl` when set. List selection / deep-links should keep using the same path that opened the page so the correct variant stays selected when multiple variants exist.

---

## 6. Quick checklist for UI

- [ ] List cards read `productPageUrl`
- [ ] Search hits read `productPageUrl` (same rule as list)
- [ ] If not null → browser URL = `productPageUrl` (exact DB value)
- [ ] If not null → detail API = `/api/v1/public/products` + `productPageUrl`
- [ ] If null → browser URL = `permalink` or `/shop/{categorySlugPath}/{slug}`
- [ ] If null → detail API = `/api/v1/public/products/{slug}`
- [ ] Do not strip `/shop` or rebuild category path when `productPageUrl` is present
- [ ] Keep trailing slash consistent with the API/DB value when calling the shop detail route
- [ ] After backend deploy, confirm Typesense reindex so search returns `productPageUrl`

---

## 7. Examples

### A) Migrated product (has `productPageUrl`)

List item:

```json
{
  "slug": "some-new-internal-slug",
  "productPageUrl": "/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/"
}
```

- UI URL: `/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/`
- API: `GET /api/v1/public/products/shop/healthcare-devices/medical-equipments/thermometer/healthemate-mt-101-accusure-thermometer/`

### B) New product (no `productPageUrl`)

List item:

```json
{
  "slug": "new-cureka-product",
  "categorySlugPath": ["nutrition", "vitamins"],
  "productPageUrl": null,
  "permalink": "/shop/nutrition/vitamins/new-cureka-product"
}
```

- UI URL: `/shop/nutrition/vitamins/new-cureka-product` (or `permalink`)
- API: `GET /api/v1/public/products/new-cureka-product`
