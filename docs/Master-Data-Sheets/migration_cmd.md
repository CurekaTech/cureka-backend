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