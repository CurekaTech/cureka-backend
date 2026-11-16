# Bulk upload: product URL export and import

**Do not re-ask for these numbers or re-run the production probes.**  
**Scope is bulk CSV export/import only.** Catalog cleanup (duplicate SKUs, shared URLs, missing photos in DB) is out of scope unless the client files a separate ticket.

| | |
| --- | --- |
| Branch | `fix/bulk-export-import-variant-urls` (from `development`) |
| Issues | #2 incorrect bulk export, #4 import creates duplicates |
| Columns | **T** Single Product URL, **U** Product Page URL |
| Media in scope | **Primary Image URL only** |

---

## Problem (bulk upload code)

### Issue 2 — export

Admin export wrote:

- **T** from `products.single_product_url` only. Every variable size got the parent URL, or blank.
- **U** from `product_variants.product_page_url` only. Null in that column → blank cell, even when the live PDP still works via slug/category.
- **Primary Image URL** from images owned by **that variant only**. Common gallery was ignored.

The Excel files counted those blank cells. They are **not** HTTP 200/404 results.

### Issue 4 — import

Client exported, changed only U, re-imported, kept SKU / Product ID.

Importer:

- Did **not parse column U**, so the new URL was not applied to the existing variant.
- Could overwrite slug/URL from a Product-ID lookup file (same WP ID on every size → same URL).
- Matched identity on **parent** WordPress ID, not variant WordPress ID (**2,223** variants have a WP ID that is not on the parent).
- If identity was ambiguous, it **created a new product**.

---

## Solution (already on the branch)

Export:

- T = product `single_product_url`, else variant copy. **Never copy U into T.**
- U = stored `product_page_url`, else the same live path sitemap/storefront uses. Variable rows **do not** inherit parent T.
- Primary image = variant images, else **common** media. Do **not** copy another size’s gallery.

Import:

- Parse column U and `UPDATE` `product_variants.product_page_url` on the matched variant.
- Product-ID lookup files apply only when **creating**, never on re-import.
- Match order: **SKU → variant WP ID → product WP ID → style_group_id / ref_id**. URL is not the identity key.
- Variant SKU match trims spaces so a stray space does not insert a second variant.

No production data writes. No mass slug repair.

---

## Numbers (already collected)

### Excel CSV (12,799 rows)

| Condition | Rows | Bulk-upload meaning |
| --- | ---: | --- |
| Both T and U present | 11,694 | Old export had stored values |
| Both blank | 647 | Includes **444 bundle child rows** (those lines never had T/U by design) plus real empty fields |
| Only T blank | 21 | U present; parent T empty — do not copy U into T |
| Only U blank | 437 | **331 variable** — classic Issue 2 (parent T filled, variant U null) |
| At least one blank | 1,105 | |
| Primary Image URL blank | 1,657 | Old export skipped common/sibling media |
| Gallery 2–6 / video blank | large | Optional slots; ignore |

HTTP status was never measured.

### Production snapshot (read-only, already run)

Catalog: **13,510** products, **13,505** export-eligible, **13,090** variants.

Stored blanks on export-eligible variants:

| Type | Variant rows | T blank | U blank | Both blank |
| --- | ---: | ---: | ---: | ---: |
| simple | 6,084 | 115 | 208 | 102 |
| variable | 6,269 | 115 | **438** | 107 |
| bundle parent | 128 | 128 | 128 | 128 |
| **total** | **12,481** | **358** | **774** | **337** |

- Variable **U blank 438** ≈ Excel “only U blank 437”. Export fix fills U from live path; it does not invent a new PDP.
- Bundle **parent** T/U are empty in DB (128). Bundle **child** CSV rows are extra blank T/U by template design.
- Variants with no own image and no common image: **1,140**. Export cannot invent photos. Remaining Excel missing-primary rows are sibling-owned images (see samples).
- Variant WP ID ≠ parent WP ID: **2,223**. This is why import must match variant WP ID / SKU.

Query 3 (`product_bundle`) was the wrong table name. Real table is `product_bundles`. Do not re-run.

### Primary image samples (export mapping, not “no photo in catalog”)

| SKU | What old export did | What new export does |
| --- | --- | --- |
| `PAI/FOV/16780` | Blank primary; **common** image exists | Fills Primary Image URL from common |
| `PAI/DON/16689`, `PAI/VIS/08876`, `Ski/Ave/01337` | Blank; images sit on **other sizes** | Still blank for that size (we do not steal sibling photos) |

`Ski/Ave/01337` also has variant WP ID `52277` vs parent `17223` — Issue 4 matching pattern.

### Breg — Issue 4 already happened

Client:

- Old URL `.../breg-knee-ligament-brace-with-standard-combined-instability-medium-z-13-ci-2`
- New URL `.../breg-knee-ligament-brace-with-standard-combined-instability-small-z-13-ci-right-xs-right`

Those are **two different variants**, not one URL rename.

| | Existing (keep) | Created by bad import (rejected) |
| --- | --- | --- |
| Product | `BRE2026160901` published | `BRE2026989534` **rejected** |
| SKU | `PAI/BRE/12129` | `HEA/BRE/18492` |
| Variant | `1d58d3f2-0a34-4df6-841a-a1739c981786` | `8fa094ed-dad4-4662-9fb7-1605669b6549` |
| URL | `...medium-z-13-ci-2/` | empty (client moved to reject list) |

Sibling sizes on the published product (`PAI/BRE/18094`–`12132`, including `...-2` suffix) already have their own U. Parent T for that family is the **XS** URL — expected for column T, which is parent/legacy.

On this product, old export of T would show the same parent URL on every size. New export keeps T as parent and writes each size’s U.

Also: `PAI/BRE/12129` already uses a legitimate **`-2` URL**. Import must preserve `-2`, not “fix” it.

---

## What we will not do in this ticket

- Backfill production `product_page_url` / images.
- Merge duplicate `COM/COM/*` SKUs or the 8 shared PDP URL pairs (separate data work).
- Copy sibling variant photos onto blank sizes.
- Copy U into T.
- Delete the rejected Breg product unless the client asks.

Those findings are only **import hazards**: duplicate SKUs can make matching ambiguous; shared U means two SKUs already claim one path.

---

## What to tell the client (bulk upload)

1. The Excel report is a **CSV completeness** check, not a live 404 report.
2. After the export fix they should re-download: variable sizes get **their own U**; T stays the parent/legacy URL.
3. Bundle child rows can still have blank T/U; that is the bundle template, not a missing PDP.
4. Primary Image URL will fill when the product has **common** media. A size with no own image and no common image stays blank.
5. Changing only U on an existing SKU will **update that variant**. It will not create another product. The Breg extra rows (`HEA/BRE/18492`–`18495`) are the old bug; they are already on the reject list.
6. If they meant to move the medium-`-2` SKU onto the `...xs-right` URL, that is a **different SKU**. They must confirm which SKU should own which URL.

---

## Next (engineering)

1. Staging on this branch.
2. Export a 5-variant product (use Breg `BRE2026160901`): one row per size, distinct U, shared parent T, `-2` preserved on `PAI/BRE/12129`.
3. Re-import the same file unchanged: product count and variant count must not rise.
4. Change only U on `PAI/BRE/12129`, import, export: same variant UUID, new URL, no new product.
5. Confirm Fovera primary fills; Donjoy Large can stay blank.

No more production SQL for this ticket.
