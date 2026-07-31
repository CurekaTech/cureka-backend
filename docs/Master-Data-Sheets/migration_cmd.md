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