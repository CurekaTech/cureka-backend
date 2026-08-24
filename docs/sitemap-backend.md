# Sitemap backend

Cureka generates Google sitemaps asynchronously. The API process never builds XML on a page request. A BullMQ worker batches PostgreSQL reads, writes XML to GCS (or local files), then the public endpoints stream those files.

## Architecture

```text
PostgreSQL
    → entity create/update/delete
    → domain events
    → mark sitemap group dirty (Redis)
    → delayed BullMQ job (`sitemap` queue)
    → SitemapProcessor (concurrency 1, inside apps/api)
    → keyset batch queries
    → validate XML
    → upload to sitemaps/.staging/{id}/
    → copy children to stable live keys
    → overwrite sitemaps/sitemap.xml last
    → delete obsolete shards + staging
    → GET /api/v1/public/sitemap.xml streams live XML (no SQL)
```

There is no `apps/worker` app. Processors run in the API process, same as bulk-upload and GoKwik.

## Module

[`modules/sitemap/`](../modules/sitemap/)

| Piece | Role |
|---|---|
| `SitemapQueryService` | Keyset reads (`id > lastId`) of indexable rows only |
| `SitemapUrl.builder` | Storefront loc paths (one URL per product, not SKU) |
| `SitemapXml.builder` | urlset / sitemapindex + validation |
| `SitemapStorageService` | Staging → live publish |
| `SitemapDirtyService` | Redis dirty flags |
| `SitemapQueueService` | Debounced `generate-group` jobs |
| `SitemapGeneratorService` | Orchestration |
| `SitemapProcessor` | BullMQ worker + safety repeatable job |
| `SitemapInvalidationListener` | Domain events → dirty + enqueue |
| `PublicSitemapController` | Stream live XML |

## Queue

- Queue name: `sitemap` (`QUEUE_NAMES.SITEMAP`)
- Jobs: `generate-all`, `generate-group`, `safety-rebuild`
- Debounce: fixed `jobId` `sitemap-generate-{group}` + `SITEMAP_DEBOUNCE_MS` (default 60s). Rapid updates reset the delay. If a job is **active**, the group stays dirty and is re-enqueued when the worker finishes.
- Safety: repeatable `every: SITEMAP_REGENERATION_INTERVAL` seconds. Regenerates **dirty groups only**, unless `SITEMAP_FORCE_FULL_REBUILD=true`.
- Concurrency: `1`

## Groups and loc rules

| Group | Source | Public loc | Indexable when |
|---|---|---|---|
| static | `config/static-urls.ts` | `/`, `/categories`, `/product-brands`, … | always |
| products | eligible `product_variants` joined to published `products` | per variant: `product_page_url` if set, else dynamic (`singleProductUrl` → `/shop/{category-path}/{product.slug}`); **dedupe by final locPath** | product `published` + not deleted; variant `active` + not deleted; valid loc. Multiple variants → multiple URLs only when final locs differ |
| categories | `categories` | `/product-category/{slugPath}` | `status=active`, not deleted, **and** ≥1 indexable product assigned (primary hierarchy columns or `product_category_hierarchies`) |
| brands | `brands` | `/product-brands/{slug}` | `status=active`, not deleted, **and** ≥1 indexable product with `brand_id` |
| health-concerns | `health_concerns` | `/health-concerns/{url-safe-slug}` | `status=active`, not deleted, **and** ≥1 indexable product via `product_health_concerns` |
| wellness-goals | `wellness_goals` | `/wellness-goals/{slugify(name)}` | `status=active`, not deleted, **and** ≥1 indexable product via `product_wellness_goals` |
| collections | `home_sections` `type=productSlider` | `/collections/{slug}` | `status=active`, not deleted, **and** ≥1 indexable product whose `ref_id` is in `product_ref_ids` |
| blogs | `blog_posts` | `/{slug}` | `published` + `visibility=public` |
| support | `support_articles` | `/support/articles/{slug}` | `status=active` |
| cms | `cms_pages` | `/about`, `/policies/privacy`, … | `status=active` |

**Indexable product** (for listing groups above) means: `products.status = published`, `products.deleted_at IS NULL`, and ≥1 `product_variants` row with `status = active` and `deleted_at IS NULL`. Empty active listings are excluded.

### Product URL precedence

For each eligible variant:

1. If `product_variants.product_page_url` is present and non-empty → use it (`CONFIGURED_VARIANT_URL`). Do **not** also emit a category-hierarchy URL for that variant.
2. Otherwise → existing dynamic builder (`product.single_product_url`, then `/shop/{category-path}/{product.slug}`) as `DYNAMIC_FALLBACK`.

Configured variant URLs take precedence over dynamically generated category URLs when the catalog hierarchy has changed.

Final sitemap locs are **deduplicated by normalized `locPath`** across the entire product generation run (including across keyset batches). Default + sibling variants that resolve to the same URL produce a single `<url>`.

Category slug changes also dirty **products** (dynamic `/shop/...` fallbacks).

Excluded: search, cart, account, facet querystrings, `/categories/{slug}`, `/blog/{slug}`, SKU-only paths.

## Batch queries

Listing groups use keyset pagination on entity `id`. **Products** keyset on `product_variants.id` with a join to published products:

```sql
-- products group (simplified)
WHERE product.status = 'published'
  AND product.deleted_at IS NULL
  AND variant.status = 'active'
  AND variant.deleted_at IS NULL
  AND variant.id > :lastVariantId
ORDER BY variant.id
LIMIT :batchSize
```

Selected columns are only those needed for loc + lastmod. Partial index: `IDX_products_sitemap_keyset` (products); variants use primary key order.

`lastmod` is the later of variant/product `updated_at`, never generation time.

## Storage / atomic publish

Reuse `@packages/storage` (GCS or local). New methods: `uploadAtPath`, `exists`, `list`, `copy`. XML is **not** sent through `uploadImage()`.

Live keys (stable public names):

```text
sitemaps/sitemap.xml
sitemaps/static.xml
sitemaps/products/products-1.xml
sitemaps/brands/brands.xml
...
```

Staging: `sitemaps/.staging/{generationId}/...` (never served). Deleted after success **and** after failure.

Publish order:

1. Copy child files to live (add `products-3.xml` before the index if shard count grew).
2. Overwrite `sitemaps/sitemap.xml` last.
3. Delete live shards no longer in the new index (only after the index is live).

Failed validation never copies to live. Previous XML stays.

No timestamped public filenames (`products-1-20260819-120000.xml`).

## Configuration

| Env | Default |
|---|---|
| `SITEMAP_ENABLED` | `true` |
| `SITEMAP_BASE_URL` | `STOREFRONT_URL` |
| `SITEMAP_BATCH_SIZE` | `10000` |
| `SITEMAP_MAX_URLS_PER_FILE` | `50000` |
| `SITEMAP_DEBOUNCE_MS` | `60000` |
| `SITEMAP_REGENERATION_INTERVAL` | `3600` |
| `SITEMAP_STORAGE_PATH` | `sitemaps` |
| `SITEMAP_FORCE_FULL_REBUILD` | `false` |

## CLI / initial generation

```bash
npm run sitemap:generate
npm run sitemap:generate -- --group=products
```

Requires `SITEMAP_BASE_URL` or `STOREFRONT_URL`. Then:

```bash
curl -i http://localhost:3000/api/v1/public/sitemap.xml
```

## Public HTTP

- `GET /api/v1/public/sitemap.xml`
- `GET /api/v1/public/sitemaps/*`

No database. `Content-Type: application/xml; charset=utf-8`.  
`Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=3600`.

There is **no CDN** in this backend. Google should hit the storefront (`www.cureka.com`); Next.js rewrites to these endpoints. See [sitemap-frontend-integration.md](./sitemap-frontend-integration.md).

## Monitoring

Worker logs include: start, group, URL count, file count, duration, upload/publish success, failure, retry `attemptsMade`.

## Troubleshooting

| Symptom | Check |
|---|---|
| 404 on sitemap.xml | Run `npm run sitemap:generate`. Confirm storage driver/bucket. |
| Stale URLs | Dirty flags / Redis up? Safety job every hour. `SITEMAP_FORCE_FULL_REBUILD=true` then restart API. |
| Missing product URLs | Product must be `published` (not deleted) with an `active` variant; that variant needs `product_page_url` or product `slug` / `single_product_url` for the dynamic fallback. |
| Duplicate loc | Generator dedupes by loc path. Product sitemap is one row per product id. |
| Broken XML after a failed job | Live files are unchanged; staging is deleted. Inspect worker error logs. |
| PM2 cluster duplicate cron | Repeatable job uses fixed `jobId` `sitemap-safety-rebuild`. |

## Deployment

1. Set sitemap env vars (`SITEMAP_BASE_URL=https://www.cureka.com`).
2. Run migration `AddProductsSitemapKeysetIndex1785953000000`.
3. Deploy API (worker is in-process).
4. `npm run sitemap:generate` once.
5. Frontend rewrite `/sitemap.xml` → API (see frontend doc).
6. Submit `https://www.cureka.com/sitemap.xml` in Google Search Console.
