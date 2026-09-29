# Admin — bundle component variant

Use this on **Bundle Products** create and edit only. Each line in the bundle is one child product and exactly one variant of that product.

The bundle’s own price and stock stay on `data.variants[0]`. Do not use that array for the component table.

## APIs

| Screen | Call |
|---|---|
| Create | `POST /api/v1/bundle-products` |
| Edit load | `GET /api/v1/bundle-products/:refId` |
| Edit save | `PATCH /api/v1/bundle-products/:refId` |

JSON or `multipart/form-data` with the JSON body in the `data` field. Same as the existing bundle create/update.

## Picker

1. Search published simple and variable products with `GET /api/v1/products?status=published&search={q}&page=1&limit=20`. Do not pass `includeBundles=true`. A bundle cannot contain another bundle line from this picker.
2. After the admin picks a product, load `GET /api/v1/products/:refId`.
3. Show `data.variants[]` and let the admin pick **one** variant.
4. Store that variant’s `id` and `sku` on the line. `id` is what you send as `childVariantId`.

A simple product has one variant. A variable product has one row per SKU. The admin must choose one SKU. Do not add every variant of the product.

The same `childProductRefId` can appear only once in `bundleItems`.

## Save body

Send this inside the existing create/update body. Other bundle fields (name, categories, pricing, `variants[0]`, media) stay as they are today.

```json
{
  "bundleItems": [
    {
      "childProductRefId": "CET2026524552",
      "childVariantId": "52e97312-3ce1-4ae8-9aee-540398a86b60",
      "quantity": 1
    }
  ]
}
```

| Field | Required | Send |
|---|---|---|
| `childProductRefId` | yes | Product `refId` |
| `childVariantId` | yes, unless you send SKU | `variants[].id` (UUID) from the product detail |
| `childVariantSku` | yes, unless you send id | `variants[].sku`. Prefer `childVariantId` |
| `quantity` | yes | Integer ≥ 1. This is how many of that variant are in the bundle. It is not warehouse stock |

If both `childVariantId` and `childVariantSku` are sent, they must be the same variant.

Do not send `variants`, `displayName`, `stock`, or `outOfStock` inside `bundleItems`. Those are read-only on GET.

`PATCH` replaces the whole component list when `bundleItems` is present. Send every line you want to keep. Omit `bundleItems` only when the edit does not change components.

## GET shape

`GET /api/v1/bundle-products/:refId`

Read `data.bundleItems[]`.

```json
{
  "id": "244dbb5b-aea7-4d38-9c9d-dfeb8dd600f7",
  "childProductRefId": "CET2026524552",
  "childProductName": "Cetaphil Serum TestSkin",
  "childVariantId": "52e97312-3ce1-4ae8-9aee-540398a86b60",
  "quantity": 1,
  "variants": [
    {
      "id": "52e97312-3ce1-4ae8-9aee-540398a86b60",
      "sku": "SKI/CET/11909",
      "displayName": "Cetaphil Serum TestSkin",
      "stock": 28,
      "outOfStock": false,
      "inCurekaInventory": true,
      "status": "active"
    }
  ]
}
```

`variants` has the saved variant only. Other SKUs of that product are not in this array.

## Component table

One table row per `bundleItems[]` entry. Use `variants[0]`.

| Column | Source |
|---|---|
| Product | `childProductName` |
| Variant title | `variants[0].displayName`. When it is `null` or `""`, show `childProductName` |
| SKU | `variants[0].sku` |
| Qty in bundle | `quantity` |
| Stock | `variants[0].stock` |
| Stock status | `variants[0].outOfStock` — `false` = In stock, `true` = Out of stock |
| Variant status | `variants[0].status` — `active` or `inactive` |
| Cureka inventory | `variants[0].inCurekaInventory` |

On edit, prefill the line from:

- product: `childProductRefId` + `childProductName`
- selected variant: `childVariantId` (same value as `variants[0].id`)
- quantity: `quantity`

On save, send `childVariantId` from that prefill. Do not rebuild the line from every variant of the product.

## Older bundles

Lines saved before this change have `childVariantId: null` and `variants` may list every SKU of the child product. On the edit screen, require the admin to pick one variant before save. A save that still omits `childVariantId` and `childVariantSku` returns **400**:

`Bundle item "<refId>" requires childVariantId or childVariantSku`

## Errors

| Status | When |
|---|---|
| 400 | Missing `childVariantId` and `childVariantSku` |
| 400 | Variant id or SKU is not on that child product |
| 400 | `childVariantId` and `childVariantSku` point at different variants |
| 400 | The same `childProductRefId` is sent twice |
| 400 | `quantity` is missing or less than 1 |

## Do not change

- `data.variants[]` is the bundle price/stock SKU (`COM/COM/00006` style). Leave the pricing form on `variants[0]`.
- `bundleAvailability` is the bundle in-stock badge. Keep using `docs/ADMIN_BUNDLE_AVAILABILITY.md` for that badge. The component table on this screen reads `bundleItems`, not `bundleAvailability.components`.
