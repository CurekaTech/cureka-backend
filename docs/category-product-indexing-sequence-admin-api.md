# Category Product Indexing Sequence — Admin Panel Integration

Screen: **CMS -> Category Product Indexing** (`/cms/category-product-indexing`)

Goal: update the display order of already-selected **Top Products** for a category without changing which products are marked as Top.

---

## When to use this API

Use this API after the admin has already selected Top Products and now wants to:

- drag and drop the selected items
- move one Top Product above/below another
- save only the order change

This API does **not** add or remove Top Products.  
For checkbox selection changes, continue using:

```http
PUT /api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products
```

---

## Endpoint

```http
PUT /api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products/sequence
Content-Type: application/json
Authorization: Bearer <ADMIN_TOKEN>
```

### Request body

```json
{
  "variantIds": [
    "uuid-of-top-variant-2",
    "uuid-of-top-variant-1",
    "uuid-of-top-variant-3"
  ]
}
```

`variantIds` must be sent in the **final desired order**.

---

## Validation rules

- `categoryRefId` is required in the URL
- `variantIds` must contain valid variant UUIDs
- `variantIds` must be unique
- the payload must contain the **full current Top Product set** for that category
- every variant in the payload must already be a Top Product in that category

If the payload is partial or includes invalid/non-top variants, the API returns `400 Bad Request`.

---

## What backend updates

For the given category:

- keeps `is_top = true` unchanged
- updates `top_sort_order` based on the array order

Example:

```json
{
  "variantIds": ["A", "B", "C"]
}
```

becomes:

- `A -> top_sort_order = 1`
- `B -> top_sort_order = 2`
- `C -> top_sort_order = 3`

---

## Recommended admin flow

1. Load current Top Products:

```http
GET /api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products
```

2. Render only the selected Top rows in a sortable list
3. Let the admin drag-drop rows into the desired order
4. Build `variantIds` from the reordered list
5. Call the sequence API
6. Refresh the Top Product list after success

---

## Response shape

```json
{
  "success": true,
  "message": "Top product sequence updated successfully",
  "data": {
    "category": {
      "refId": "CAT2026XXXX",
      "name": "Skin Care",
      "slug": "skin-care",
      "hierarchyLevel": 1,
      "hierarchyLabel": "Sub Category"
    },
    "updatedCount": 3,
    "variants": [
      {
        "id": "uuid-of-top-variant-2",
        "sku": "SKU-002",
        "slug": "product-b",
        "productRefId": "PRO2026XXXX",
        "productName": "Product B",
        "isTop": true,
        "topSortOrder": 1
      },
      {
        "id": "uuid-of-top-variant-1",
        "sku": "SKU-001",
        "slug": "product-a",
        "productRefId": "PRO2026YYYY",
        "productName": "Product A",
        "isTop": true,
        "topSortOrder": 2
      }
    ]
  }
}
```

---

## Error example

When the frontend sends only a partial list:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Sequence payload must contain the full current top-product set for this category."
}
```

---

## UI notes

- Keep checkbox save and sequence save as two separate actions
- Sequence UI should work only on the currently selected Top Products
- If checkbox selection changes, save selection first, then allow reorder
- After reorder success, use returned `variants[].topSortOrder` as the source of truth

---

## API cheat sheet

| Purpose | Method | Path |
|--------|--------|------|
| Load current Top Products | `GET` | `/api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products` |
| Save checked Top Products | `PUT` | `/api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products` |
| Save Top Product sequence | `PUT` | `/api/v1/admin/category-product-indexing/categories/:categoryRefId/top-products/sequence` |
