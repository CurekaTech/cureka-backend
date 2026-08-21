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

-------------------------------

// sitemap 
npm run sitemap:generate

-------------------------------
// top products ( variant is_top)
npm run product:mark-top
npm run product:mark-top -- --apply



