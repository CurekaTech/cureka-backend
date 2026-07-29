# Frontend Integration Guide: Multiple Category Hierarchies Per Product

This guide describes the backend changes that allow a single product to belong to **multiple independent category hierarchies**. It is written for frontend implementers and does not require reading backend source.

**Related APIs:** `POST /api/v1/products`, `PATCH /api/v1/products/:refId`, `POST /api/v1/products/bulk-mark-out-of-stock`, Product Bulk Upload  
**Swagger:** `/api/v1/docs` → **Products** / **Product Bulk Upload**

---

## What changed

Previously a product had exactly one hierarchy:

```
Category → Sub Category → Sub Sub Category → Sub Sub Sub Category
```

Now a product can have **N independent hierarchies**. Example:

```
Hierarchy 1: Health & Wellness → Skin Care → Moisturizers
Hierarchy 2: Beauty → Face Care → Treatments
```

### Backward compatibility

| Surface | Behavior |
|---------|----------|
| Flat request fields (`categoryRefId`, `subCategoryRefId`, …) | Still supported. Treated as a **single** hierarchy. |
| Flat response fields (`categoryRefId`, `categoryName`, `subCategoryRefId`, …) | Still returned. They always reflect the **primary** hierarchy (first entry / `sortOrder: 0`). |
| Nested detail objects (`category`, `subCategory`, …) | Still returned for the primary hierarchy. |
| New field `categories` (request + response) | Preferred way to send/read **all** hierarchies. |
| New detail field `categoryHierarchies` | Nested category objects for every hierarchy (admin detail). |

Existing admin screens that only send/read flat fields keep working. To support multiple hierarchies, switch create/edit forms to the `categories` array.

---

## Request payloads

### Preferred: `categories[]`

```json
{
  "name": "Vitamin C Serum 30ml",
  "productType": "simple",
  "brandRefId": "BRA20261234",
  "categories": [
    {
      "categoryRefId": "HEA20260016",
      "subCategoryRefId": "SUB20260011",
      "subSubCategoryRefId": "SSC20260022"
    },
    {
      "categoryRefId": "BEA20260001",
      "subCategoryRefId": "SUB20260099"
    }
  ],
  "variants": [
    {
      "sku": "VIT/C/30-A1",
      "mrp": 799,
      "sellingPrice": 649,
      "stock": 50
    }
  ]
}
```

Rules:

- `categories` must be a non-empty array when provided (`min 1`).
- Each item requires `categoryRefId`.
- `subCategoryRefId`, `subSubCategoryRefId`, `subSubSubCategoryRefId` are optional per hierarchy.
- Hierarchies are independent; levels in hierarchy 2 do not need to relate to hierarchy 1.
- The **first** item is the primary hierarchy (mirrored onto flat response fields).
- When both `categories` and flat `categoryRefId` fields are sent, **`categories` wins**.

### Legacy (still valid): flat fields

```json
{
  "name": "Vitamin C Serum 30ml",
  "productType": "simple",
  "brandRefId": "BRA20261234",
  "categoryRefId": "HEA20260016",
  "subCategoryRefId": "SUB20260011",
  "subSubCategoryRefId": "SSC20260022",
  "variants": [ { "sku": "VIT/C/30-A1", "mrp": 799, "sellingPrice": 649, "stock": 50 } ]
}
```

This creates exactly one hierarchy. Either `categories` **or** `categoryRefId` is required on create.

---

## Update product (`PATCH /api/v1/products/:refId`)

| Intent | How |
|--------|-----|
| Replace all hierarchies | Send full `categories` array (complete replace). |
| Change only primary (legacy) | Send flat `categoryRefId` / sub-* fields. **Caution:** this replaces the product’s hierarchies with a **single** hierarchy built from those fields (secondary hierarchies are removed). |
| Leave hierarchies unchanged | Omit both `categories` and all flat category fields. |

**Recommended UI pattern:** always load current `categories` from GET detail, let the admin add/remove/edit rows, and submit the full `categories` array on save.

### Example: add a second hierarchy

```json
{
  "categories": [
    {
      "categoryRefId": "HEA20260016",
      "subCategoryRefId": "SUB20260011",
      "subSubCategoryRefId": "SSC20260022"
    },
    {
      "categoryRefId": "BEA20260001",
      "subCategoryRefId": "SUB20260099",
      "subSubCategoryRefId": "SSC20260100"
    }
  ]
}
```

### Example: remove a hierarchy

Send `categories` **without** the removed entry (still at least one remaining).

---

## Response shape

### List / create / update (`IProduct`)

```json
{
  "refId": "PRO20261234",
  "name": "Vitamin C Serum 30ml",
  "categoryRefId": "HEA20260016",
  "categoryName": "Health & Wellness",
  "subCategoryRefId": "SUB20260011",
  "subSubCategoryRefId": "SSC20260022",
  "subSubSubCategoryRefId": null,
  "categories": [
    {
      "categoryRefId": "HEA20260016",
      "categoryName": "Health & Wellness",
      "subCategoryRefId": "SUB20260011",
      "subCategoryName": "Skin Care",
      "subSubCategoryRefId": "SSC20260022",
      "subSubCategoryName": "Serums",
      "subSubSubCategoryRefId": null,
      "subSubSubCategoryName": null,
      "sortOrder": 0
    },
    {
      "categoryRefId": "BEA20260001",
      "categoryName": "Beauty",
      "subCategoryRefId": "SUB20260099",
      "subCategoryName": "Face Care",
      "subSubCategoryRefId": null,
      "subSubCategoryName": null,
      "subSubSubCategoryRefId": null,
      "subSubSubCategoryName": null,
      "sortOrder": 1
    }
  ]
}
```

### Admin detail (`GET /api/v1/products/:refId`)

Same as above, plus:

- Nested primary objects: `category`, `subCategory`, `subSubCategory`, `subSubSubCategory`
- `categoryHierarchies`: array of nested objects for every hierarchy

```json
{
  "categoryHierarchies": [
    {
      "sortOrder": 0,
      "category": { "id": "...", "refId": "HEA20260016", "name": "Health & Wellness", "slug": "health-wellness", "position": 1 },
      "subCategory": { "id": "...", "refId": "SUB20260011", "name": "Skin Care", "slug": "skin-care", "position": 2 },
      "subSubCategory": { "id": "...", "refId": "SSC20260022", "name": "Serums", "slug": "serums", "position": 1 },
      "subSubSubCategory": null
    }
  ]
}
```

### Public product detail

Flat primary fields are unchanged. An optional `categories` array (same shape as admin list) is included when hierarchies are loaded. Category listing/filter endpoints match a product if **any** of its hierarchies contain the requested category.

---

## Suggested frontend form model

```ts
type CategoryHierarchyFormRow = {
  categoryRefId: string;
  subCategoryRefId?: string;
  subSubCategoryRefId?: string;
  subSubSubCategoryRefId?: string;
};

// Form state
const [hierarchies, setHierarchies] = useState<CategoryHierarchyFormRow[]>([
  { categoryRefId: '' },
]);

// On submit
body: {
  ...,
  categories: hierarchies.filter((row) => row.categoryRefId),
}
```

UI suggestions:

- Render one “hierarchy card” per row with cascading category selects (reuse existing category pickers).
- “Add category hierarchy” appends a new empty card.
- “Remove” deletes a card (block remove when only one remains).
- On edit load: prefer `product.categories`; if empty, seed one row from flat `categoryRefId` / sub-* fields.

---

## Bulk upload

### Format

Use `|` (pipe) to encode multiple hierarchies. Values are paired **by index**.

| Category * | Sub Category | Sub Sub Category |
|---|---|---|
| `A \| B` | `A1 \| B1` | `A2 \| B2` |

Means:

1. `A → A1 → A2`
2. `B → B1 → B2`

Single hierarchy (no change):

| Category * | Sub Category |
|---|---|
| `Health & Wellness` | `Skin Care` |

### Validation rules

1. **Category** is required (at least one name).
2. If Sub Category / Sub Sub Category / Sub Sub Sub Category cells contain pipes (or any values), their **pipe-segment counts must equal** the Category segment count.
3. Mismatched lengths fail the row, e.g.:

   - Category: `A | B`
   - Sub Category: `A1`
   - Sub Sub Category: `A2 | B2`  
   → **validation error**

4. Empty segments are allowed for a missing level at that index, e.g. Sub Category `A1 | ` (hierarchy 2 has no sub-category), as long as counts match.
5. Each resolved name must exist in the Category master.

### Sample template

`GET /api/v1/products/bulk-upload/template/download` now includes:

- A **single-category** sample row
- A **multi-category** sample row using `|`
- A **Multi-Category Notes** reference sheet with alignment rules

---

## Error cases to handle in UI

| Scenario | Typical API / upload response |
|----------|-------------------------------|
| Create with neither `categories` nor `categoryRefId` | `400` validation: `categoryRefId is required when categories is not provided` |
| `categories: []` | `400` (`ArrayMinSize`) |
| Unknown category refId | `404` `Category with refId "…" not found` |
| Bulk pipe length mismatch | Row error on `Category` column describing length mismatch |
| Unknown category name in sheet | Row error: category master unavailable |
| Update with only flat category fields while product had multiple hierarchies | Succeeds, but secondary hierarchies are cleared — warn in UI if current `categories.length > 1` |

---

## Edge cases

1. **Primary hierarchy**: Always `categories[0]` / `sortOrder: 0`. Reorder the array to change which hierarchy is primary (affects flat fields and primary permalink path).
2. **Category filters**: Valid if assigned to **any** of the product’s root categories.
3. **Listing by category**: A product appears under a category page if that category appears in **any** hierarchy (root or deeper levels).
4. **Tag limits**: Still enforced against the **primary** root category (`categoryId` on the product row).
5. **Partial update of one hierarchy among many**: Not supported as a patch-of-index API. Always send the full `categories` list after edit.
6. **Migration**: Existing products are backfilled into `product_category_hierarchies` with one row matching their previous flat FKs.

---

## Checklist for frontend

- [ ] Create product form supports multiple hierarchy cards and submits `categories[]`
- [ ] Edit product loads `categories` (fallback to flat fields) and saves full `categories[]`
- [ ] Detail / list UIs can show all hierarchies (not only primary)
- [ ] Warn when switching a multi-hierarchy product back to legacy flat-only save
- [ ] Bulk upload docs / tooltips mention `|` alignment + equal length rule
- [ ] Category browse pages still work (backend matches any hierarchy)
- [ ] Product list multi-select supports **Mark out of stock** via `POST /products/bulk-mark-out-of-stock`

---

## Bulk mark out of stock

Admin product list can multi-select products and mark them out of stock in one action.

### Endpoint

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/v1/products/bulk-mark-out-of-stock` | Bearer JWT — `SUPER_ADMIN`, `ADMIN` |

**Swagger:** `/api/v1/docs` → **Products** → `POST /products/bulk-mark-out-of-stock`

### Behavior

- Accepts product `refId`s from the list selection.
- Deduplicates refIds (variable products may appear as multiple list rows sharing one `refId`).
- Sets **stock = 0** on every non-deleted variant of each product.
- Does **not** change product status (`published` / `draft` / etc.) or variant status (`active` / `inactive`).
- Emits product-updated events for cache / search / Unicommerce sync.
- Max **500** product refIds per request.

### Request

```json
{
  "productRefIds": ["PRO20261234", "PRO20265678", "PRO20269001"]
}
```

| Field | Type | Rules |
|-------|------|-------|
| `productRefIds` | `string[]` | Required, min 1, max 500, each a valid product refId |

### Response example

```json
{
  "success": true,
  "message": "Products marked out of stock successfully",
  "data": {
    "requested": 3,
    "updated": ["PRO20261234", "PRO20265678"],
    "alreadyOutOfStock": ["PRO20269001"],
    "notFound": [],
    "variantsUpdated": 4
  }
}
```

| Field | Meaning |
|-------|---------|
| `requested` | Unique refIds after dedupe |
| `updated` | Products that had at least one variant with stock &gt; 0 (now set to 0) |
| `alreadyOutOfStock` | Found products where every variant was already stock ≤ 0 |
| `notFound` | RefIds that do not exist |
| `variantsUpdated` | Total variant rows whose stock was changed to 0 |

### Frontend usage notes

1. Collect `refId` from each selected list row (product refId, not variant UUID).
2. Deduplicate client-side before calling (optional; server also dedupes).
3. On success, refresh the list (or patch local stock to `0` for those products/variants).
4. Show a toast using `variantsUpdated` / `updated.length` — and mention `notFound` if any.
5. Empty selection: disable the action button (do not call with `[]`).

### Error cases

| Scenario | Response |
|----------|----------|
| Missing / empty `productRefIds` | `400` validation |
| More than 500 refIds | `400` (`ArrayMaxSize`) |
| Invalid refId format | `400` |
| All refIds unknown | `200` with `updated: []`, `notFound: [...]` (not a hard error) |

---

## Quick API summary

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/v1/products` | Request: `categories[]` (or legacy flat) |
| `PATCH` | `/api/v1/products/:refId` | Request: `categories[]` (full replace) |
| `GET` | `/api/v1/products/:refId` | Response: `categories`, `categoryHierarchies` |
| `GET` | `/api/v1/products` | Response: `categories` per item |
| `POST` | `/api/v1/products/bulk-mark-out-of-stock` | Body: `{ productRefIds: string[] }` → set all variant stock to 0 |
| Bulk template / import | `/api/v1/products/bulk-upload/...` | Pipe-aligned Category columns |
