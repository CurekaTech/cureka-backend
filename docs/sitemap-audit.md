# Sitemap audit & data export

Read-only CLI for exporting sitemap entity inventories, eligibility, generated URLs, data-quality issues, URL lookups, and DB-vs-live-sitemap comparisons.

**Does not modify** sitemap generation, the database, or the frontend. Allowed operations are **SELECT only**.

## Purpose

Answer recurring questions such as:

- Which categories / brands / health concerns are in Admin / DB?
- What URLs would sitemap generation emit?
- Which records are eligible vs excluded, and why?
- Does this storefront URL map to a DB row, and is it sitemap-eligible?
- What differs between eligible DB URLs and the currently published live XML?

## Supported types

| Type | Source | Storefront loc |
| --- | --- | --- |
| `categories` | `categories` | `/product-category/{slugPath}` |
| `brands` | `brands` | `/product-brands/{slug}` |
| `health-concerns` | `health_concerns` | `/health-concerns/{slugify(slug)}` |
| `wellness-goals` | `wellness_goals` | `/wellness-goals/{slugify(name)}` |
| `collections` | `home_sections` `productSlider` | `/collections/{slug}` |
| `products` | `products` | `product_page_url` → `singleProductUrl` → `/shop/.../{slug}` |
| `blogs` | `blog_posts` | `/{slug}` |
| `static` | `SITEMAP_STATIC_URLS` | configured hub paths |

Base origin: `SITEMAP_BASE_URL` or fallback `STOREFRONT_URL`.

## Commands

```bash
npm run sitemap:audit categories
npm run sitemap:audit brands -- --format=both
npm run sitemap:audit products -- --format=csv
npm run sitemap:audit all
npm run sitemap:audit categories -- --status=active --eligible-only
npm run sitemap:audit categories -- --ineligible-only
npm run sitemap:audit categories -- --search=diabetes
npm run sitemap:audit categories -- --refId=CAT001
npm run sitemap:audit check -- --url=https://beta.cureka.com/product-brands/himalaya
npm run sitemap:audit compare categories
```

Formats: `--format=xlsx` (default), `csv`, or `both`.

## Output

Timestamped directory:

```text
reports/sitemap-audit/YYYY-MM-DD/
  categories-audit.xlsx
  categories-audit.csv          # if csv/both
  summary.xlsx                  # when running `all`
  compare-categories.xlsx       # when running compare
```

Each XLSX has:

1. **Summary** — counts and issue tallies  
2. **Records** — DB rows + generated URLs + `Sitemap Eligible`  
3. **Data Issues** — missing/duplicate/invalid/soft-deleted/ineligible flags  

CSV contains the Records sheet only.

## Eligibility (same rules as generation)

Shared **indexable product**: `published`, not deleted, ≥1 active non-deleted variant.

| Type | Eligible when |
| --- | --- |
| categories | `active`, not deleted, ≥1 indexable product (hierarchy columns or `product_category_hierarchies`) |
| brands | `active`, not deleted, ≥1 indexable product on `brand_id` |
| health-concerns | `active`, not deleted, ≥1 indexable product via `product_health_concerns` |
| wellness-goals | `active`, not deleted, ≥1 indexable product via `product_wellness_goals` |
| collections | `active` productSlider, not deleted, ≥1 indexable product in `product_ref_ids` |
| products | per active non-deleted variant on a `published` non-deleted product; loc from `product_page_url` or dynamic fallback; first unique final loc is eligible — later duplicates are ineligible (`Duplicate final sitemap URL`) and flagged as `duplicate_url` / `not_eligible` |
| blogs | `published` + `visibility=public`, not deleted |
| static | always |

Compare uses `SitemapQueryService` collectors for the eligible set and live XML from `SitemapStorageService` (same objects generation publishes).

## Architecture

Registry of providers under `modules/sitemap/audit/providers/`. To add a type:

1. Implement `SitemapAuditProvider`  
2. Register it in `SitemapAuditService.onModuleInit` and `SitemapModule`  
3. Add the type to `SITEMAP_AUDIT_TYPES`  
4. Wire `collectEligibleLocPaths` for compare  

URL building reuses `modules/sitemap/services/sitemap-url.builder.ts`. Listing product content reuses `modules/sitemap/utils/sitemap-indexable-product.util.ts`.

## VM usage

```bash
cd /path/to/cureka-backend
# Ensure .env (or process env) has DATABASE_URL and SITEMAP_BASE_URL / STOREFRONT_URL
npm run sitemap:audit categories
npm run sitemap:audit all -- --format=xlsx
npm run sitemap:audit compare brands
```

If compare reports empty live locs, run `npm run sitemap:generate` first so live XML exists in storage.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `SITEMAP_BASE_URL or STOREFRONT_URL must be set` | Set origin used in `<loc>` values |
| Empty eligible counts for listings | Confirm products are published with active variants and linked correctly |
| Compare “missing from sitemap” after code change | Regenerate that group: `npm run sitemap:generate -- --group=brands` |
| Reports missing | Look under `reports/sitemap-audit/<date>/` (gitignored) |
