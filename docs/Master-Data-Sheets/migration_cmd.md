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
