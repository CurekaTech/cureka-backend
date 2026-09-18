# Product media backfill & harvest

Hardened WooCommerce → GCS image migration for Cureka.

## Why legacy URLs fail

The Excel sheet (`docs/wc-product-export-6-7-2026-1783309274325.xlsx`) still lists:

`https://www.cureka.com/wp-content/uploads/YYYY/MM/filename.ext`

Files now live on `https://legacy.cureka.com`. Many Excel paths have the **wrong year/month**. The same basename can exist under multiple folders with **different file contents** — the tooling must never auto-pick among duplicates.

Other failures:

| Symptom | Cause |
|---------|--------|
| HTTP 404 | Wrong path or file deleted |
| `image/x-ms-bmp` rejected | Server `UPLOAD_ALLOWED_MIME_TYPES` listed `image/bmp` only; legacy sends `image/x-ms-bmp`. Backfill now normalizes to `image/bmp` via magic bytes |
| Truncated `…/wp-` | Malformed Excel cell → `MALFORMED_URL` |

## Manifest

Generate on the legacy WordPress host (tab-separated, optional gzip):

```text
relative_path<TAB>basename<TAB>size
wp-content/uploads/2024/10/p74-2.jpg<TAB>p74-2.jpg<TAB>12345
```

Place at:

```text
docs/legacy-uploads-manifest.tsv.gz
```

Do not edit the manifest from the backfill tool.

## Resolution algorithm

1. Normalize URL; rewrite only `www.cureka.com` / `cureka.com` → `legacy.cureka.com`
2. Apply optional `--mapping` override (human-approved)
3. GET exact URL
4. On **404**: basename lookup in manifest  
   - 0 → `MISSING_SOURCE`  
   - 1 → retry corrected URL  
   - 2+ → `AMBIGUOUS_SOURCE` (no auto-pick)
5. Validate body (magic bytes, reject HTML-as-200, size limit)
6. Upload to GCS then DB (backfill) or cache map (harvest)

## Commands

### Audit only (no GCS / DB writes)

```bash
npm run product:backfill-media -- \
  --audit-only \
  --only-missing \
  --manifest=docs/legacy-uploads-manifest.tsv.gz \
  --report-dir=reports/product-media-backfill
```

### Apply backfill (append missing only)

```bash
npm run product:backfill-media -- \
  --only-missing \
  --apply \
  --manifest=docs/legacy-uploads-manifest.tsv.gz \
  --mapping=docs/legacy-media-overrides.csv \
  --checkpoint=reports/product-media-backfill/checkpoint.json
```

### Resume

```bash
npm run product:backfill-media -- \
  --resume \
  --checkpoint=reports/product-media-backfill/checkpoint.json \
  --apply \
  --only-missing \
  --manifest=docs/legacy-uploads-manifest.tsv.gz
```

### Harvest with reports

```bash
npm run product:harvest-images -- \
  --apply \
  --manifest=docs/legacy-uploads-manifest.tsv.gz \
  --mapping=docs/legacy-media-overrides.csv \
  --report-dir=reports/product-image-harvest
```

Dry-run remains the default when `--apply` is omitted.

## Override CSV

`docs/legacy-media-overrides.csv`:

```csv
original_url,resolved_url,note
https://www.cureka.com/wp-content/uploads/2024/12/p74-2.jpg,https://legacy.cureka.com/wp-content/uploads/2024/10/p74-2.jpg,reviewed for SKU X
```

`resolved_url` must be on `https://legacy.cureka.com`. Never auto-written by the tool.

## Reports

### Backfill — `reports/product-media-backfill/<timestamp>/`

| File | Contents |
|------|----------|
| `summary.json` | Counts + duration |
| `success.csv` | Uploaded / resolved OK |
| `missing-source.csv` | 404 + no unique manifest hit |
| `ambiguous-source.csv` | Multiple candidates |
| `malformed-url.csv` | Truncated / invalid |
| `unsupported-media.csv` | Bad MIME / HTML body |
| `unmatched-products.csv` | Sheet ID not in DB |
| `failed-upload.csv` | GCS/DB failures |
| `skipped-existing.csv` | Already had media / basename |

### Harvest — `reports/product-image-harvest/<timestamp>/`

Same classification CSVs plus `skipped-cached.csv` (URL already in harvest cache).

No secrets, signed URLs, or credentials are written.

## Safety / rollback

- `--only-missing` never deletes existing `product_media`
- Destructive rewrite requires `--replace --confirm --apply`
- Match only by `external_product_id` — unmatched sheet IDs are reported, never invented
- Upload then DB transaction; on DB failure the new GCS object is deleted when possible and logged in `failed-upload.csv`
- Checkpoint fingerprints the spreadsheet + manifest so `--resume` cannot mix inputs

## Integrations suppressed

Both commands boot **minimal Nest modules** (`ProductMediaBackfillCommandModule` / `ProductImageHarvestCommandModule`):

- Config + Logger + Storage (+ TypeORM with full entity glob for backfill relation metadata; no AppModule)
- **No** HTTP server, BullMQ processors, GoKwik, BOB, Unicommerce, SMS/email, Typesense, abandoned-cart

Product media rows are written directly; `PRODUCT_UPDATED` is **not** emitted, so catalog sync listeners do not fire.

## Ops note: BMP on beta

Prefer deploying this normalize-to-`image/bmp` fix. Optionally also add `image/x-ms-bmp` to `UPLOAD_ALLOWED_MIME_TYPES` on the server.
