# Backend image pipeline

Production-safe resized image bytes for the Cureka storefront. This document records the audit, the implemented architecture, operations, and limits.

Backend image delivery does **not** by itself fix JavaScript/INP, TTFB, or guarantee a PageSpeed score. Lab LCP ~11.5s / ~8.3 MB payload / ~5.1 MB estimated image savings are user-supplied baselines, not re-measured here.

## 1. Audit findings

### Stack (verified)

- NestJS 10.4 + Fastify 4.28 + TypeORM 0.3 + PostgreSQL
- GCS via `@google-cloud/storage` 7.21 (`packages/storage`) or local disk
- BullMQ 5 + Redis, Joi env validation, Pino, PM2 cluster (`ecosystem.config.js`)
- `image-size` used only for blog featured-image dimension checks
- **No** Cloudinary / imgix / ImageKit / Cloudflare Images / GCS transform API
- **No** `apps/worker` directory; all processors previously ran inside the API process
- GCS `uploadAtPath` previously set `cacheControl: private, max-age=0, no-transform`

### Why approach B (pre-generated derivatives)

There is no documented transformation CDN contract in this repository or its config. Appending `w=` / `f=webp` to `storage.googleapis.com` URLs does nothing. Approach A is therefore unavailable. This change implements **BullMQ + sharp → WebP objects** in the existing bucket (or local `uploads/`), served with the same signed-URL / `/uploads` rules as originals.

### Storage

| Path | Role |
|------|------|
| `packages/storage/src/storage.service.ts` | Upload, signing, path safety, now `readObjectBuffer` + post-upload hook |
| `packages/storage/src/gcs-storage.provider.ts` | GCS v4 signed URLs; default TTL env `GCS_SIGNED_URL_TTL_SECONDS` |
| `packages/storage/src/local-storage.provider.ts` | `/uploads/{key}` |
| `packages/storage/src/storage-file-reference.interface.ts` | Persisted `{ key, name }`; response `{ key, name, url, imageDelivery? }` |

Persisted identity is **bucket + object key**, never a signed URL.

### Upload routes (all under `/api/v1`)

| Route | File |
|-------|------|
| `POST /uploads/:folder` | `modules/uploads/controllers/uploads.controller.ts` |
| `POST /gallery/upload` | `modules/gallery/controllers/gallery.controller.ts` |
| `POST /products`, `PATCH /products/:refId` | `modules/product/controllers/products.controller.ts` |
| `POST /products/bulk-upload` | bulk upload → `modules/product/processors/bulk-upload.processor.ts` |
| Master multipart (banners, brands, categories, blog, …) | `modules/uploads/services/multipart-form.service.ts` |

Hook: every `StorageService.uploadImage` / `uploadAtPath` notifies `STORAGE_UPLOAD_HOOK` (`ImagePipelineService`). Raster storefront folders are scheduled; videos, PDFs, SVG, private folders, and `derivatives/**` are skipped.

### Public serializers (unchanged field types)

All storefront image URLs already flow through `StorageUrlEnricher` **after** Redis. Redis stores `{ key, name }` only. Adding `imageDelivery` at enrich time means variant readiness appears on the next request **without** blasting product caches.

| Surface | Enricher usage | File |
|---------|----------------|------|
| Homepage `/public/homepage/sections` | `enrichDeep` | `modules/public/services/homepage-sections.service.ts` |
| Homepage `/public/homepage/banners` | banner enricher | `modules/master` banners + public homepage |
| PDP / listing / search | `toReference` / `enrichFields` / `enrichDeep` | `modules/public/services/public-products.service.ts` |
| Bundles, brands, categories, HC, WG | enricher | `modules/public/services/*` |
| Watch & shop, expert talk | enricher / sections | public + homepage |
| Cart / orders `imageUrl` string | still a string; `primaryImageUrl.imageDelivery` is additive | `modules/orders/mappers/order.mapper.ts` |

### Absent modules (not invented)

- No CDN transform adapter
- No previous `image_assets` table
- No `sharp` pipeline before this change
- No separate worker app before this change

### Protected behavior

Order, payments (Razorpay / Cashfree / GoKwik / COD / refunds), prices, coupons, inventory, auth, SEO slugs, tracking event names, and unrelated BullMQ jobs were not modified.

## 2. Architecture

```
Upload original (existing UUID key)
  → image_assets row status=pending + process_token
  → BullMQ queue `image-pipeline` (after persist; enqueue failure leaves the row)
  → dedicated worker (IMAGE_WORKER_ENABLED)
      download source (bounded bytes, outside any DB transaction)
      hash + inspect (magic bytes, EXIF rotate, no upscale, no SVG raster, no animated flatten)
      write derivatives/v1/{sha256}/w{actualWidth}.webp
      CAS publish WHERE process_token = job token
  → public GET enricher batches image_assets + signs original and ready variant keys
```

Public GET handlers **never** encode images and **never** fetch arbitrary URLs.

### Data model

Migration: `apps/api/database/migrations/1785985000000-create-image-pipeline-tables.ts`

`image_assets` (one row per source object):

- `source_bucket`, `source_key` (unique)
- `source_hash` (SHA-256 of bytes; set when processed)
- actual source width/height/mime/bytes
- `pipeline_version`, `status` (`pending|processing|ready|partial|failed|unsupported`)
- `process_token` — replacement during processing cannot publish stale variants
- `variants` JSON: `{ width, height, format, bytes, key }[]` (only after successful upload)
- `error_code` / short `error_message` (no URLs)

`image_pipeline_checkpoints` — durable backfill resume.

Derivative keys include source hash + pipeline version + actual output width, so overwriting the same source path cannot reuse old bytes.

### Status in API `imageDelivery`

| status | Meaning | Frontend |
|--------|---------|----------|
| `pending` | Not processed yet | Use `imageUrl` / `url` original |
| `partial` | Some widths uploaded | Use listed variants; fall back original |
| `ready` | All applicable widths exist (no upscaling of smaller sources) | Prefer variants |
| `failed` | Permanent processing failure | Original only |
| `unsupported` | SVG, animated, PDF, etc. | Original only (animation/SVG preserved) |

`variants[]` contains **actual** output dimensions, never a requested size that was not produced.

Widths: 100, 160, 240, 480, 800, 1200, and 1600 when the source is at least that wide. 1600 exists for hero/PDP zoom, not for 120 CSS-pixel cards.

A 120 CSS-pixel card at DPR 2 needs ~240 px. A 388 CSS-pixel hero at DPR 2 needs ~800 px. Do not force heroes to 240.

### Config (defaults preserve current production)

| Env | Default | Purpose |
|-----|---------|---------|
| `IMAGE_DELIVERY_ENABLED` | `false` | Attach `imageDelivery` on API responses |
| `IMAGE_PROCESSING_ENABLED` | `false` | Create pending rows + enqueue on upload/backfill |
| `IMAGE_WORKER_ENABLED` | `false` | Register BullMQ processor (API cluster must stay false) |
| `IMAGE_WORKER_CONCURRENCY` | `1` | Per **process**. PM2 fork=1 → global 1. Never enable on API `instances: 2`. |
| `IMAGE_PIPELINE_VERSION` | `v1` | Derivative key namespace |
| `IMAGE_WEBP_QUALITY` | `80` | Conservative WebP quality |
| `IMAGE_MAX_INPUT_BYTES` | 15 MiB | Worker download cap |
| `IMAGE_MAX_DECODED_PIXELS` | 40e6 | sharp `limitInputPixels` |
| `IMAGE_PROCESS_TIMEOUT_MS` | 30000 | Encode timeout |
| `GCS_SIGNED_URL_TTL_SECONDS` | Joi 3600 / storage config fallback 86400 | See signed-URL budget |

AVIF is **not** enabled (encode cost + compatibility not validated).

### Signed URL validity budget

Observed:

- Redis product cache TTL default 900s (`PRODUCT_CACHE_TTL`); homepage 600s
- Enrichment signs **after** cache, so cached JSON does not embed signed URLs
- Storefront ISR was reported at 60s; that is **not** a 61s signed TTL
- In-process signing cache refreshes 5 minutes before expiry
- Long-lived tabs and failed revalidation need remaining URL life

**Budget:** keep `GCS_SIGNED_URL_TTL_SECONDS` ≥ 86400 (24h) in production so a page held for hours plus clock skew still loads. Cache metadata, not signatures. Frontend must re-fetch API JSON when a signed URL 403/404s (see frontend doc). Do not cache private responses on a public CDN; derivatives use `private, max-age=31536000, immutable` object metadata **and** remain signed. Private source images do not become anonymous.

## 3. Backfill / retry commands

Dry-run is the default. **Do not run a production backfill as part of this implementation.**

```bash
# Local / staging after migration + worker
npm run image:backfill
IMAGE_PROCESSING_ENABLED=true npm run image:backfill -- --apply --entity-types=banners --sample-limit=5 --batch-size=5
IMAGE_PROCESSING_ENABLED=true npm run image:backfill -- --apply --priority=homepage --batch-size=25 --rate-limit-ms=200
IMAGE_PROCESSING_ENABLED=true npm run image:backfill -- --apply --resume
IMAGE_PROCESSING_ENABLED=true npm run image:retry -- --apply --limit=50
```

Pause: stop the image worker (`pm2 stop cureka-image-worker`) and/or set `IMAGE_PROCESSING_ENABLED=false`. Pending rows remain. Resume with `--resume`. Completion: `alreadyComplete` grows and `eligible` on a dry-run approaches 0 for current `IMAGE_PIPELINE_VERSION`.

Counts: `scanned`, `eligible`, `alreadyComplete`, `queued`, `unsupported`, `missingSource`, `failed`, `skippedDuplicate`.

Originals are never deleted. Product business columns are not updated.

## 4. Test evidence

Commands:

```bash
npx jest modules/image-pipeline packages/storage/src/upload-size.util.spec.ts modules/uploads/services/storage-url.enricher.spec.ts --runInBand
npx tsc -p apps/api/tsconfig.app.json --noEmit
```

Covered: aspect ratio / no upscale / alpha / EXIF; corrupt + SVG; private/signed log redaction; pending vs ready variants; duplicate/replaced process tokens; enqueue failure leaves pending; dry-run / resume / skip current; enricher batching and flag-off shape (`url` remains string).

**Synthetic sharp samples** (solid-color JPEG generated in unit tests — **not** production photos; photographic banners will compress less):

| Source | Original bytes | Derivative | Output | Bytes | Reduction |
|--------|----------------|------------|--------|-------|-----------|
| 1500×1500 JPEG q90 | 13 524 | w240 WebP | 240×240 | 190 | 98.6% |
| 1500×1500 JPEG q90 | 13 524 | w800 WebP | 800×800 | 1 224 | 90.9% |
| 2875×1025 JPEG q90 | 17 816 | w800 WebP | 800×285 | 470 | 97.4% |
| 2875×1025 JPEG q90 | 17 816 | w1600 WebP | 1600×570 | 1 700 | 90.5% |

w1600 on the 1500-wide product did **not** upscale (output 1500×1500). Real Cureka heroes (~891 KiB) and product photos (300–485 KiB) should be re-measured in staging; do not treat this table as a PageSpeed guarantee.

Worker load was not measured against production. Public API request path does not invoke sharp.

## 5. Rollout / rollback

1. `npm run migration:run` (additive tables only)
2. Deploy API with `IMAGE_DELIVERY_ENABLED=false`, `IMAGE_PROCESSING_ENABLED=false`, `IMAGE_WORKER_ENABLED=false`
3. GCS IAM: worker SA needs `objects.get` on sources and `objects.create` on `derivatives/**` (same private bucket)
4. Start **one** `cureka-image-worker` (fork, 1 instance) in staging with processing enabled
5. Process a sample (`--sample-limit=10 --apply --entity-types=banners`)
6. Enable `IMAGE_DELIVERY_ENABLED=true` in staging; frontend consumes `imageDelivery`
7. Limited homepage backfill; verify transfer sizes in browser
8. Production: same order; never enqueue the full catalog on API startup

Rollback: set `IMAGE_DELIVERY_ENABLED=false` (old `{ key, name, url }` remains). Stop the worker. Original objects stay. Do **not** down-migrate.

## 6. Limitations

- Existing catalog is unchanged until backfill + frontend `srcSet` consumption
- Blog HTML-embedded remote URLs are not rewritten
- Return-evidence / vendor-docs / avatars are intentionally not processed
- No automatic derivative cleanup
- Next.js `/_next/image` 504 issue is **not** re-investigated here
- GTM/GA4/WhatsApp/BOB are out of scope
