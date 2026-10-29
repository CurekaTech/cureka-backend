<!-- * Sheets / files:
 *   Health-Concern.xlsx     → health_concerns (split on `|` only)
 *   CF_Preference.xlsx      → category_filters.name = "Preference" (merge values[], split on `|`)
 *   CF_Formulation.xlsx     → category_filters.name = "Formulation / Product Form" (merge values[], no split) -->

# dry-run (default)
npm run master-data:import

# write to DB
npm run master-data:import -- --apply

-------------------------------------------------------------

# Category hierarchy import (separate script)

# dry-run
npm run category-master:import

# write to DB
npm run category-master:import -- --apply

Files (default folder: docs/Master-Data-Sheets):
- Category - Subcategory.xlsx  → ROOT + Sub category
- Sub-Sub-Sub-Category.xlsx    → Sub category + Sub Sub category

---------------------------------
++++++ Search Tags +++++++++++
# Preview
npm run product:migrate-search-tags

# Apply
npm run product:migrate-search-tags -- --apply

# Limit to specific products
npm run product:migrate-search-tags -- --ref-ids=SUN20261234,SUN20264567 --apply

# Also remove the Tags label from product_information_labels
npm run product:migrate-search-tags -- --apply --deactivate-label

# After apply, reindex Typesense so search picks up the new tags:
npm run typesense:reindex

# dry-run
npm run product-page-url:import
# apply
npm run product-page-url:import:apply


-----------------------------

npm run product-sku:remap -- --file="docs/sku-code-mismatch-beta-1.xlsx"
npm run product-sku:remap:apply

-------------------------------

# preview — no DB/storage writes
npm run product:backfill-media -- --only-bmp

# apply safely (append missing BMPs only)
npm run product:backfill-media -- --only-bmp --apply

npm run product:backfill-media -- --only-bmp --replace --confirm --apply

# Hardened backfill / harvest (manifest, audit, reports) — see docs/PRODUCT_MEDIA_BACKFILL.md
npm run product:backfill-media -- --audit-only --only-missing --manifest=docs/legacy-uploads-manifest.tsv.gz
npm run product:harvest-images -- --manifest=docs/legacy-uploads-manifest.tsv.gz
npm run product:harvest-images -- --apply --manifest=docs/legacy-uploads-manifest.tsv.gz

----------------------------------

# Dry-run first — shows what will be updated
npm run product:oos-update -- --file="docs/Master-Data-Sheets/OOS-Beta.xlsx"

# Apply to DB
npm run product:oos-update -- --file="docs/Master-Data-Sheets/OOS-Beta.xlsx" --apply

# Dry-run first — shows current vs new prices for first 20 rows
npm run product:price-update -- --file="docs/Master-Data-Sheets/ updated-price-02-aug.xlsx"

# Apply to DB
npm run product:price-update -- --file="docs/Master-Data-Sheets/updated-price-02-aug.xlsx" --apply

-------------------------------------------------------

# Dry-run first — preview what will change (safe, no DB writes)
npm run product:meta-update

# Apply the changes
npm run product:meta-update -- --apply

# Apply with a limit for testing
npm run product:meta-update -- --apply --limit=50

# Custom file path
npm run product:meta-update -- --file="docs/Master-Data-Sheets/meta-data-beta-products.xlsx" --apply

---------------------------------

# Dry-run first
npm run product:sku-fix

# Apply
npm run product:sku-fix -- --apply

# Optional
npm run product:sku-fix -- --apply --limit=10

---------------------------

# Return policy from no-returnable-products sheet
# Sheet SKU Code → variant.sku (case-insensitive; SKU is the only match key)
# Matches: returnAllowed=false (returnWindowDays unchanged)
# Everyone else: returnAllowed=true, returnWindowDays=2

# Dry-run first
npm run product:return-allowed

# Apply
npm run product:return-allowed -- --apply

# Optional
npm run product:return-allowed -- --file="docs/Master-Data-Sheets/no-returnable-products-31.08.2026.xlsx" --apply

# Export Excel SKUs not found in DB (read-only, no variant updates)
npm run product:return-allowed:unmatched

---------------------------

# COD blocking SKUs — exact, case-sensitive match on sku_ids
# File: docs/Master-Data-Sheets/CODBLOCKINGSKUS-09-10.xlsx
# Excel cells are trimmed. The database SKU is not trimmed or lowercased.
# HER/ZIN/08945 matches only HER/ZIN/08945.
# Matched variants only:
#   codAvailable=false, returnAllowed=false, returnPolicy=null, returnWindowDays=null
#
# Env (from .env, same as other runners):
#   DATABASE_URL
#   REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_USERNAME, REDIS_TLS
#
# Dry-run first (no database writes, no cache changes)
npm run product:cod-blocking
#
# Apply
npm run product:cod-blocking -- --apply
#
# Optional file override
npm run product:cod-blocking -- --file="docs/Master-Data-Sheets/CODBLOCKINGSKUS-09-10.xlsx" --apply

# Parent product flags only; dry-run first. Products with an unlisted
# non-deleted variant remain unchanged to avoid blocking sibling variants.
npm run product:cod-blocking:products
npm run product:cod-blocking:products -- --apply
#
# After a successful update, product list, PDP, variant-search, recommendation,
# and homepage-section Redis keys are invalidated. Redis is not flushed.
# If the database update succeeds and cache invalidation fails, the script
# prints the affected product ref ids and variant ids. Recover with:
npm run cache:invalidate-products

---------------------------

# Sitemap — exclude empty listing groups / regenerate products
npm run sitemap:generate -- --group=categories
npm run sitemap:generate -- --group=brands
npm run sitemap:generate -- --group=health-concerns
npm run sitemap:generate -- --group=wellness-goals
npm run sitemap:generate -- --group=collections
npm run sitemap:generate -- --group=products

# Or full regenerate
npm run sitemap:generate

# Sitemap audit (DB vs live)
npm run sitemap:audit categories
npm run sitemap:audit brands -- --format=both
npm run sitemap:audit all
npm run sitemap:audit check -- --url=https://beta.cureka.com/product-brands/himalaya
npm run sitemap:audit compare categories

-------------------------------
# top products (variant is_top)
npm run product:mark-top
npm run product:mark-top -- --apply

npm run sitemap:generate -- --group=products

-------------------------------------

npm run category:above-the-fold:fix-urls          # apply fixes to sheet
npm run category:above-the-fold:fix-urls -- --dry-run   # preview only

// Above the fold master data import
# Dry-run (default)
npm run category:above-the-fold

# Apply to DB
npm run category:above-the-fold -- --apply

# Optional
npm run category:above-the-fold -- --file="docs/Master-Data-Sheets/cureka_category_page_

------------------------------

# Dry-run (default)
npm run product:update-dyna-prices

# Apply changes
npm run product:update-dyna-prices -- --apply

# Custom file
npm run product:update-dyna-prices -- --file="docs/Master-Data-Sheets/Dyna-Price-List-changed.xlsx"

-----------------------------------------

unicommerce order push script

// Dry-run (loads Cureka orders, does not call Unicommerce):
npm run unicommerce:push-orders

// Push to Unicommerce:
npm run unicommerce:push-orders -- --apply

// If prepaid is still unpaid / status is PENDING and you still want the push:
npm run unicommerce:push-orders -- --force --apply

//Override the array without editing the file:
npm run unicommerce:push-orders -- --orders=ORD111,ORD222 --apply

--------------------------------


# 1) Preview (safe)
npm run product:strip-sku-from-variant-slugs

# 2) Preview one SKU / small batch
npm run product:strip-sku-from-variant-slugs -- --sku=SKI/MES/18441
npm run product:strip-sku-from-variant-slugs -- --limit=20

# 3) Apply for real
npm run product:strip-sku-from-variant-slugs -- --apply

------------------
npm run typesense:reindex
npm run cache:invalidate-products


--------------------------------------
// Update Order Status

# dry-run (shows what will change)
npm run order:update-status -- --order-id=ORD438873955361

# apply delivered update (order + shipments)
npm run order:update-status -- --order-id=ORD438873955361 --apply

# custom statuses
npm run order:update-status -- --order-id=ORD20260911001 --order-status=SHIPPED --shipment-status=IN_TRANSIT --apply

-------------------------------
sql for mark order as completed:

-- Set this once:
-- replace with UUID/ref_id/order_number
WITH target_order AS (
  SELECT id, order_number, payment_method, payment_status, notes
  FROM orders
  WHERE id::text = 'ORD_OR_UUID_HERE'
     OR ref_id = 'ORD_OR_UUID_HERE'
     OR order_number = 'ORD_OR_UUID_HERE'
  LIMIT 1
),
updated_order AS (
  UPDATE orders o
  SET
    order_status = 'DELIVERED',
    delivered_at = COALESCE(o.delivered_at, NOW()),
    payment_status = CASE
      WHEN o.payment_method = 'COD' AND o.payment_status <> 'PAID' THEN 'PAID'
      ELSE o.payment_status
    END,
    notes = CASE
      WHEN COALESCE(o.notes, '') = '' THEN 'Manually marked DELIVERED from SQL'
      ELSE o.notes || E'\n' || 'Manually marked DELIVERED from SQL'
    END,
    updated_at = NOW(),
    updated_by = 'sql:manual-status-update'
  FROM target_order t
  WHERE o.id = t.id
  RETURNING o.id, o.order_number, o.order_status, o.payment_status, o.delivered_at
)
UPDATE shipments s
SET
  shipment_status = 'DELIVERED',
  shipway_raw_status = 'DEL',
  last_synced_at = NOW(),
  updated_at = NOW(),
  updated_by = 'sql:manual-status-update'
FROM updated_order u
WHERE s.order_id = u.id
RETURNING s.id, s.order_id, s.shipment_status, s.awb_number;

------------------------------------------------

npm run product:sku-unique -- --drop      # during migration
npm run product:sku-unique -- --restore   # after old simples cleaned up

----------------------------

// Backfill (existing DB products only — attaches WP images to product_media)
npm run product:backfill-media -- --all-matched
npm run product:backfill-media -- --all-matched --apply

# Harvest ALL Excel images into GCS (product does not need to exist in DB).
# Writes docs/wp-product-image-gcs-map.xlsx used by bulk upload Product ID lookup.
# Keep legacy.cureka.com up until this finishes.

# preview
npm run product:harvest-images
npm run product:harvest-images -- --limit=20

# apply (resume-safe; re-run until pending=0)
npm run product:harvest-images -- --limit=20 --apply
npm run product:harvest-images -- --apply

# dry-run — should show matchedInDb ≈ 10597, unmatched ≈ 5040
npm run product:harvest-images -- \
  --manifest=docs/legacy-uploads-manifest.tsv.gz \
  --report-dir=reports/product-image-harvest

# then apply
npm run product:harvest-images -- \
  --apply \
  --manifest=docs/legacy-uploads-manifest.tsv.gz \
  --report-dir=reports/product-image-harvest

# Dedupe redundant product_media (dry-run first)
# same-key dupes always; product-level-while-variant-gallery needs --drop-product-level
npm run product:dedupe-media
npm run product:dedupe-media -- --ref-id=MEN2026665813
npm run product:dedupe-media -- --drop-product-level
npm run product:dedupe-media -- --drop-product-level --apply

# 1) Dry-run all products
npm run product:dedupe-media -- --drop-product-level

# 2) Check the client example first
npm run product:dedupe-media -- --ref-id=MEN2026665813 --drop-product-level

# 3) Apply when reports look right
npm run product:dedupe-media -- --drop-product-level --apply


-------------------------

// Google Sheet
npm run google-merchant:export-sheet
npm run google-merchant:export-sheet -- --env-label=techbv

-------------------------

npm run import:pincodes
npm run typesense:reindex

---------------------------

# No-COD and no-return from no-return-no-cod sheet
# Sheet SKU → variant.sku (case-insensitive; SKU is the only match key)
# SKU in sheet: codAvailable=false, returnAllowed=false (returnWindowDays unchanged)
# Active or out-of-stock SKU not in sheet: codAvailable=true, returnAllowed=true, returnWindowDays=2
# Inactive SKU that is not out of stock and not in the sheet: unchanged
# All non-deleted variant SKUs in the sheet: product codAvailable=false, returnAllowed=false
# Every active or out-of-stock variant SKU absent from the sheet: product codAvailable=true, returnAllowed=true, returnWindowDays=2
# Mixed products: variant flags follow each SKU; product flags stay unchanged
# Reports: docs/Master-Data-Sheets/exports/no-return-no-cod-unmatched.csv
#          docs/Master-Data-Sheets/exports/no-return-no-cod-updated.csv
#          docs/Master-Data-Sheets/exports/no-return-no-cod.log

# Same COD / return rules for every command below, including out-of-stock variants.
# Dry-run writes nothing. --apply writes. --test only swaps the sheet.
# --once applies once per database: TechBV uses the test sheet, any other storefront uses the full sheet.

# Dry-run first
npm run product:no-return-no-cod

# Apply (writes DB, clears Redis product cache, revalidates the storefront)
npm run product:no-return-no-cod -- --apply

# First deploy of this version only. Uses STOREFRONT_URL:
#   techbv  → docs/Master-Data-Sheets/test-techbv.xlsx
#   live    → docs/Master-Data-Sheets/no-return-no-cod-02-10.xlsx
# Writes one_time_data_scripts key product-no-return-no-cod-oos and skips on every later deploy.
# A database that already ran the older key still runs this version once, so OOS variants are included.
# scripts/deploy-beta.sh runs this after migrations.
npm run product:no-return-no-cod -- --once

# Optional
npm run product:no-return-no-cod -- --file="docs/Master-Data-Sheets/no-return-no-cod-02-10.xlsx" --apply

# TechBV test sheet only (docs/Master-Data-Sheets/test-techbv.xlsx). Same rules, including OOS. Dry-run unless --apply.
# Run this on the TechBV server, where DATABASE_URL points at the TechBV database.
npm run product:no-return-no-cod -- --test
npm run product:no-return-no-cod -- --test --apply

# Optional later test sheet. Same rules, including OOS.
npm run product:no-return-no-cod -- --test --test-file="docs/Master-Data-Sheets/another-test.xlsx"

----------------------------

# Reconcile the updated legacy image sheet (docs/Master-Data-Sheets/legacy-image-urls-10-09.xlsx)
# against the harvest cache and missing-images.xlsx.
# Dry-run does not download, write GCS, or change the DB.
# --apply copies the cache JSON and GCS map to timestamped .bak files first.
# It refuses to run if docs/wp-image-harvest-cache.json is missing, unless --allow-empty-cache.
# A URL already in the cache is reused only after the GCS object exists and validates as an image.
# Invalid objects are downloaded again from legacy.cureka.com while that site is still up.
# After a valid GCS key is stored, bulk upload uses that key and does not call the legacy host.
# Simple products get the images on their single default variant (type=image), not as common media.
# DB writes are limited to unambiguous matches that are also on missing-images.xlsx.
# Conflicts are reported and not written. Products missing from the DB are still stored in the map.

# preview
npm run product:reconcile-legacy-images

# apply
npm run product:reconcile-legacy-images -- --apply

# small batch, then re-run until pending downloads are done
npm run product:reconcile-legacy-images -- --limit=20 --apply

# Report: docs/Master-Data-Sheets/legacy-image-reconcile-report.xlsx
# Sheets: Updated, Download Failures, Not In DB, Missing Without Legacy, Conflicts

# TechBV / current-environment test. Uses the DB and GCS config of the process
# that launches it (no hardcoded database). Only unambiguous variant matches in
# that database are downloaded, backed up, and written. Unmatched legacy rows
# are counted and skipped. Dry-run is the default and does not write.
# Report: docs/Master-Data-Sheets/legacy-image-reconcile-techbv-report.xlsx

npm run product:reconcile-legacy-images:test
npm run product:reconcile-legacy-images:test -- --dry-run
npm run product:reconcile-legacy-images:test -- --apply

----------------------------

# Bundle component identity backfill (existing bundle order lines only)
# Writes productId, variantId, sku, productName, variantName, quantityPerBundle
# from current product_bundles onto order_items.bundle_components.
# Skips a line when any child product or variant cannot be identified.
# Never overwrites an existing snapshot. Never writes cod_available.
# Run the migration first: 1785998000000-add-return-replace-bundle-snapshot

# Dry-run first
npm run orders:backfill-bundle-components

# Apply
npm run orders:backfill-bundle-components -- --apply
# Recover images for variants that have none, and store legacy images for
# SKU + product ID pairs that are not in the database yet.
# Dry-run does not download, write GCS, or change the DB or cache.
# --apply backs up the cache JSON and GCS map once, then flushes them every 25 uploads.
# A stored GCS key is reused and is not downloaded again. --limit counts new downloads only.
# DB writes require SKU and product ID together. Orphan rows never create products or media.
# Report: docs/Master-Data-Sheets/legacy-image-recover-report.xlsx
# A finished run prints COMPLETED and Process stopped, then returns to the shell.
# Mode TEST skips orphan backup. Mode LIVE runs database recovery and orphan backup.

npm run product:recover-legacy-images
npm run product:recover-legacy-images -- --apply
npm run product:recover-legacy-images -- --apply --limit=500

# TechBV test. Same DB recovery rules, but only variants that already exist.
# Does not harvest legacy rows that are missing from the database.
# Report Summary sheet: Mode TEST, Phase DB RECOVERY ONLY, Orphan harvesting DISABLED.

npm run product:recover-legacy-images -- --test
npm run product:recover-legacy-images -- --test --apply --limit=50

# Back up only these SKUs from the legacy image sheet.
# Does not check the database. Dry-run writes nothing.
# --apply merges them into the existing cache JSON and GCS map.
# Bulk upload reads docs/wp-image-harvest-cache.json and docs/wp-product-image-gcs-map.xlsx.
npm run product:backup-legacy-skus -- --sku=BEB/ACN/05489,COM/COM/16483,COM/COM/16484,COM/COM/16485,COM/COM/16486,COM/COM/16487,COM/COM/16489,COM/COM/16490,COM/COM/16491,COM/COM/16492,COM/COM/16493,COM/COM/16494,COM/COM/16495,COM/COM/16496,COM/COM/16497,COM/COM/16498
npm run product:backup-legacy-skus -- --apply --sku=BEB/ACN/05489,COM/COM/16483,COM/COM/16484,COM/COM/16485,COM/COM/16486,COM/COM/16487,COM/COM/16489,COM/COM/16490,COM/COM/16491,COM/COM/16492,COM/COM/16493,COM/COM/16494,COM/COM/16495,COM/COM/16496,COM/COM/16497,COM/COM/16498

npm run product:legacy-image-sheet-matches


// wallet
npm run wallet:credit -- --phone=8888888888 --amount=2000
npm run wallet:credit -- --phone=9974440132 --amount=3000 --apply


npm run review:import:test
npm run review:import:test -- --apply


# Live product reviews. Large sheets are processed in batches (default 200 rows).
# SKU lookups are prefetched per batch. Inserts commit in chunks of 50.
# Redis product cache is NOT cleared — do not run cache:invalidate-products afterward
# unless you intentionally want storefront product payloads refreshed immediately.
# Dry-run first, then apply with an explicit live confirm.
$env:REVIEW_IMPORT_LIVE_DATABASE = "your_live_database_name"
npm run review:import:live
npm run review:import:live -- --apply --confirm-live
npm run review:import:live -- --apply --confirm-live --batch-size=500