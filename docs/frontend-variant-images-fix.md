# Frontend Fix: Variant Images (`NoSuchKey` issue)

## Problem

Some product detail responses return image URLs that fail with:

```xml
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Details>No such object: cureka-files-prod/images/products/...</Details>
</Error>
```

This means the DB contains an image key that does not exist in GCS bucket anymore.

## Root Cause (Frontend side)

Frontend saved manual/old keys (for example `images/products/NUTROVA-WHEY-ISOLATE-1-1.jpg`) instead of saving the key returned by upload API.

## Correct Flow (Always follow this)

1. Upload file first via `POST /api/v1/uploads/images`
2. Read `path` from upload response
3. Save that exact `path` in `variants[].images[].url`

Do not invent or transform image keys.

---

## 1) Upload API Example

Endpoint:

- `POST /api/v1/uploads/images`
- Content-Type: `multipart/form-data`
- Field: `file`

Example response:

```json
{
  "success": true,
  "data": {
    "path": "images/6f2b8c4a-3c14-4d65-9a6f-2e5d8f9ad2c1.jpg"
  }
}
```

Use only `data.path`.

---

## 2) Product Create/Update Payload (Variable Product)

```json
{
  "productType": "variable",
  "variants": [
    {
      "sku": "DIE/CET/001-m",
      "images": [
        {
          "url": "images/6f2b8c4a-3c14-4d65-9a6f-2e5d8f9ad2c1.jpg",
          "isPrimary": true,
          "sortOrder": 0
        },
        {
          "url": "images/95b78c54-f0d8-4d94-b9ab-0c12b2ac1b99.jpg",
          "isPrimary": false,
          "sortOrder": 1
        }
      ]
    }
  ]
}
```

For `simple` product, same format but only one variant.

---

## 3) Multipart Save Pattern (if sending product form-data)

When using multipart for product save:

- Put full JSON in form field `data`
- Add files as:
  - `variantImages_<sku>` (or `variantImages[<sku>]`)

If metadata is in `variants[].images`, file order must match array index.

---

## 4) Rules to avoid breakage

- Always store upload `path` exactly as returned by backend.
- Never store signed URL (`...X-Goog-...`) in `url` field.
- Never hardcode bucket paths like `images/products/some-name.jpg`.
- On edit/update, keep existing valid `url` values for images you want to retain.
- If `images` is sent in update, include all images to keep (not only new ones).

---

## 5) How to fix already broken products

For each broken image:

1. Re-upload image via upload API
2. Get fresh `data.path`
3. Replace broken `variants[].images[].url` with new path
4. Save product again

---

## 6) Frontend checklist

- [ ] Upload returns `data.path`
- [ ] Save payload uses only `data.path`
- [ ] No manual key construction
- [ ] No signed URL saved to DB payload
- [ ] Variant image arrays maintain correct `sortOrder`
- [ ] Exactly one `isPrimary: true` per variant

