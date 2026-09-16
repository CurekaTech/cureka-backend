# Admin image integration

No admin UI redesign is required for the image pipeline to work. Uploads, replacements, bulk import, and gallery behave as before. Optimized variants are generated **asynchronously** after the original is stored.

## What stays the same

- Multipart field names, folders, and success payloads (`path`, `filename`, `mimetype`, `size`, `file.key`, `file.name`, `file.url`)
- Persisted DB value is still `{ key, name }` (gallery `url` remains a relative path string)
- Original GCS/local objects are never overwritten by derivatives and never deleted by this pipeline
- Product prices, publish rules, and media `isPrimary` / `sortOrder` are unchanged
- Soft-deleted brand banners and other existing hide rules are unchanged

## Additive field on upload/file responses

When `IMAGE_DELIVERY_ENABLED=true`, `file` (and any other `{ key, name, url }` media object) may include `imageDelivery`.

Immediately after upload, status is typically `pending` with `variants: []`. The admin preview should keep using `file.url` (original). Do not block save/publish on variants.

Example `POST /api/v1/uploads/images` `file` object after processing has finished (later GET of the product/banner):

```json
{
  "key": "images/<uuid>.jpg",
  "name": "cureka-files-prod",
  "url": "https://storage.googleapis.com/cureka-files-prod/images/<uuid>.jpg?...",
  "imageDelivery": {
    "status": "ready",
    "original": { "url": "https://…", "width": 1500, "height": 1500 },
    "variants": [{ "url": "https://…/w240.webp?…", "width": 240, "height": 240, "format": "webp", "bytes": 12000 }]
  }
}
```

If delivery is disabled, `imageDelivery` is omitted — current admin clients keep working.

## Pending / failed processing

| Admin observation | Backend meaning | Required admin action |
|-------------------|-----------------|------------------------|
| Image saved, storefront still shows large original | Worker pending or delivery flag off / frontend not consuming variants | None in admin UI |
| `status: failed` | Corrupt/oversize/unreadable raster | Re-upload a valid JPEG/PNG/WebP |
| `status: unsupported` | SVG, animated GIF/WebP, PDF, video | Keep original; do not expect variants |
| Replacement at same or new file | New `process_token`; old job cannot publish over the new source | None |

Bulk Excel/ZIP import and remote WooCommerce-style imports that already land in GCS/local storage are scheduled like normal uploads. External URLs that cannot be stored as in-bucket objects keep their existing URL and are not fetched by a public proxy.

## Retry / backfill

There is **no** new admin HTTP retry screen. Operators with server access use:

```bash
npm run image:backfill
npm run image:backfill -- --apply --entity-types=banners --sample-limit=20
npm run image:retry -- --apply --limit=50
```

Those commands are authenticated by infrastructure access (DB/Redis/.env), not a public route.

## Optional later UI (not implemented)

A processing badge (`pending` / `ready` / `failed`) on media pickers would be additive. Do not invent workflows that replace the original preview with a derivative inside admin zoom tools.
