# Combine simple products — Admin Panel Integration

Turn two or more **simple** products into **one variable product** by reparenting their existing variant rows and assigning attribute combinations.

**SKU, variant UUID (`variantId`), and variant `externalProductId` do not change.** Do not generate new SKUs. Do not create extra variants for unused Cartesian cells.

No migration.

---

## Screen flow

1. **Pick simples** — existing catalog list `GET /api/v1/products?productType=simple`. Admin selects at least two.
2. **Preview** — `POST /api/v1/products/combine-preview` with the selected `productRefIds`. Response includes each product’s **`variantId`**, `sku`, and variant `externalProductId` (read-only).
3. **Choose attributes** — either pass `attributeRefIds` on preview, or load masters from `GET /api/v1/master/attributes` (`attributes.read`) then re-call preview with those refIds.
4. **Assign combinations** — UI builds cells from `attributes[].values`. Assign **one unique combination per selected product** (1:1). If Color×Size would be 6 cells and there are 3 products, assign only 3 unique combinations. Unused cells are ignored — **do not auto-create variants**.
5. **Confirm** — show SKU / `variantId` / `externalProductId` as read-only. Pick which simple stays live (`targetProductRefId`).
6. **Combine** — `POST /api/v1/products/combine-variants`. After success, PDP is the parent; each option is the same `variantId` / SKU.

---

## Auth

Same as product update (`PATCH /api/v1/products/:refId`):

| | |
|--|--|
| Auth | Admin JWT (`Authorization: Bearer`) |
| Roles | `SUPER_ADMIN` or `ADMIN` |
| Permission | Same as product update (`products.update`) |

Content-Type: `application/json`.

Response envelope is the usual `{ success, data, message, timestamp }`. Examples below show `data`.

---

## Endpoints

| Action | Method | Path | Mutates? |
|--------|--------|------|----------|
| List simples (picker) | `GET` | `/api/v1/products?productType=simple` | No |
| Attribute masters (optional picker) | `GET` | `/api/v1/master/attributes` | No |
| Preview selected set | `POST` | `/api/v1/products/combine-preview` | No |
| Apply mapping | `POST` | `/api/v1/products/combine-variants` | Yes |

---

## API 1 — Preview

```http
POST /api/v1/products/combine-preview
```

Bootstraps the mapping screen. Does **not** change catalog.

### Request

```json
{
  "productRefIds": ["PRO20261234", "PRO20265678", "PRO20269012"],
  "attributeRefIds": ["ATT20261001"]
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `productRefIds` | yes | Distinct simple product refIds. Min **2**, max **50**. |
| `attributeRefIds` | no | Attribute masters the admin already picked. Min 1 when sent, max **20**. Returned with `name` / `values` so the UI can build combinations. Omit on first load if attributes are chosen after preview. |

### Response `data`

```json
{
  "products": [
    {
      "productRefId": "PRO20261234",
      "name": "Whey 500g",
      "status": "published",
      "variantId": "7c2a1b90-3d4e-4f5a-8b6c-1d2e3f4a5b6c",
      "sku": "WHEY-500G",
      "externalProductId": "UC-500G",
      "sellingPrice": "1299.00",
      "stock": 40
    },
    {
      "productRefId": "PRO20265678",
      "name": "Whey 1kg",
      "status": "published",
      "variantId": "8d3b2c01-4e5f-506b-9c7d-2e3f4a5b6c7d",
      "sku": "WHEY-1KG",
      "externalProductId": "UC-1KG",
      "sellingPrice": "2199.00",
      "stock": 22
    },
    {
      "productRefId": "PRO20269012",
      "name": "Whey 2kg",
      "status": "published",
      "variantId": "9e4c3d12-5f60-617c-ad8e-3f4a5b6c7d8e",
      "sku": "WHEY-2KG",
      "externalProductId": "UC-2KG",
      "sellingPrice": "3999.00",
      "stock": 8
    }
  ],
  "attributes": [
    {
      "refId": "ATT20261001",
      "name": "Size",
      "dataType": "string",
      "values": ["500g", "1kg", "2kg"],
      "status": "active"
    }
  ]
}
```

| Field | Notes |
|-------|--------|
| `products[].variantId` | The simple’s **only** variant UUID. Send this back on combine. |
| `products[].sku` | Read-only. Must not be edited or regenerated. |
| `products[].externalProductId` | Variant `external_product_id`. Read-only. |
| `attributes` | Empty array when `attributeRefIds` was omitted. Values come from the attribute master — **do not invent values**. |

Use `attributes[].values` as the option list. If a master has no `values` list (`null` or `[]`), the UI may allow a free-text value (still required, non-empty).

---

## API 2 — Combine

```http
POST /api/v1/products/combine-variants
```

Applies the mapping: converts `targetProductRefId` to `productType=variable`, reparents every assigned variant onto that parent, writes attribute values, remaps media / open cart / saved-for-later, and soft-deletes the other simples.

### Request

```json
{
  "targetProductRefId": "PRO20261234",
  "attributeRefIds": ["ATT20261001"],
  "assignments": [
    {
      "productRefId": "PRO20261234",
      "variantId": "7c2a1b90-3d4e-4f5a-8b6c-1d2e3f4a5b6c",
      "attributes": [{ "attributeRefId": "ATT20261001", "value": "500g" }]
    },
    {
      "productRefId": "PRO20265678",
      "variantId": "8d3b2c01-4e5f-506b-9c7d-2e3f4a5b6c7d",
      "attributes": [{ "attributeRefId": "ATT20261001", "value": "1kg" }]
    },
    {
      "productRefId": "PRO20269012",
      "variantId": "9e4c3d12-5f60-617c-ad8e-3f4a5b6c7d8e",
      "attributes": [{ "attributeRefId": "ATT20261001", "value": "2kg" }]
    }
  ]
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `targetProductRefId` | yes | Canonical parent that **stays live**. Must be one of `assignments[].productRefId`. |
| `attributeRefIds` | yes | Distinct attribute masters. Min 1, max 20. Every assignment must include **all** of these. |
| `assignments` | yes | One row per simple. Min 2, max 50. Distinct `productRefId` and distinct `variantId`. |
| `assignments[].variantId` | yes | Must equal that simple’s only variant UUID from preview. |
| `assignments[].attributes` | yes | `{ attributeRefId, value }` for every selected attribute. Values non-empty. Combinations must be unique. When the master has a `values[]` list, the value must match an entry (case-insensitive; stored as the canonical master value). |

Do **not** send SKU or `externalProductId` — they are not updated.

### Response `data`

```json
{
  "targetProductRefId": "PRO20261234",
  "productType": "variable",
  "variantIds": [
    "7c2a1b90-3d4e-4f5a-8b6c-1d2e3f4a5b6c",
    "8d3b2c01-4e5f-506b-9c7d-2e3f4a5b6c7d",
    "9e4c3d12-5f60-617c-ad8e-3f4a5b6c7d8e"
  ],
  "movedProductRefIds": ["PRO20265678", "PRO20269012"]
}
```

After success, `GET /api/v1/products/PRO20261234` is the variable parent. Each variant still has the original `id` / `sku` / `externalProductId`.

---

## What stays vs what is soft-deleted

**Unchanged on each variant row**

- `id` (`variantId`)
- `sku`
- `external_product_id`
- vendor SKU, barcode, prices, stock, `product_page_url`

**Product-level listing**

- Only the canonical parent stays live (`refId`, slug, `products.external_product_id`).
- Other simples in the assignment set are **soft-deleted** (`movedProductRefIds`).
- Parent `product_type` becomes `variable`.
- Product–attribute mappings are written on the parent.
- Variant media (`product_media.variant_id`) and source common media (`variant_id IS NULL`) are remapped to the parent `product_id`.
- Open cart lines and saved-for-later lines for those `variant_id`s have `product_id` rewritten to the parent (cart validation requires matching product + variant).
- Product cache and Typesense are invalidated / reindexed via the existing `PRODUCT_UPDATED` event (`deleted` for moved simples, `updated` for the parent).

**Not created**

- Extra variants for unused Color×Size (etc.) cells
- New SKUs or new variant `external_product_id`s

---

## UI mapping notes

- Show SKU / `variantId` / `externalProductId` as **read-only** on the assignment grid.
- Combinations are assigned to **existing** simples, 1:1. Never auto-fill unused Cartesian cells.
- Re-call preview after the admin picks attributes if the first preview omitted `attributeRefIds`.
- Confirm which product is `targetProductRefId` (name, slug, listing URL stay that product’s).
- After combine, shop PDP is the parent; options are the same `variantId`s.

---

## Error cases

HTTP 400 unless noted.

| Situation | Typical message |
|-----------|-----------------|
| Fewer than 2 products / assignments | Validation error (`ArrayMinSize`) |
| Duplicate `productRefIds` or `attributeRefIds` | `productRefIds must be unique` / `attributeRefIds must be unique` |
| Duplicate assignment product | `assignments[].productRefId must be unique` |
| Duplicate assignment `variantId` | `Each assignment must use a distinct variantId` |
| `targetProductRefId` not in assignments | `targetProductRefId must be one of the assignment products` |
| Product not found | `404` — `Product with refId "…" not found` |
| Bundle | `Product "…" is a bundle and cannot be combined` |
| Already variable (or not simple) | `Product "…" is "variable" — only simple products can be combined` |
| Not exactly one active variant | `Product "…" must have exactly one active variant to combine` |
| `variantId` ≠ that simple’s variant | `variantId does not match the simple product "…"` |
| Assignment missing a selected attribute | `Each assignment must include all selected attributes (missing "…")` |
| Extra / unknown attribute on assignment | `Attribute refId "…" is not configured for this product` |
| Empty attribute value | `Variant attribute value cannot be empty` |
| Duplicate combinations | `Duplicate variant attribute combinations detected for this product (…)` |
| Value not on master `values[]` (when the list is non-empty) | `Value "…" is not allowed for attribute "…"` |
| Attribute missing / inactive | `404` not found, or `Attribute "…" is not active` |

---

## Related APIs (unchanged)

| Action | Method | Path |
|--------|--------|------|
| Catalog picker | `GET` | `/api/v1/products?productType=simple` |
| Attribute masters | `GET` | `/api/v1/master/attributes` |
| Parent detail after combine | `GET` | `/api/v1/products/:refId` |
