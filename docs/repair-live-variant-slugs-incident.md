# Live `-2` slug repair — what broke, listing/images, rollback

Status: **already applied in production**. Do **not** re-run `npm run product:repair-live-variant-slugs -- --apply` on the old logic. There is nothing left to “strip” on URLs that no longer end in `-2`.

## 1. What the original script did

`npm run product:repair-live-variant-slugs` was meant to remove a **false uniqueness suffix** only:

| Intended | Example |
|---|---|
| Parent already owns the clean slug; variant got `-2` because the parent slug was treated as a global collision | `xyz-face-wash` + variant `xyz-face-wash-2` → both `xyz-face-wash` |

It also updated `product.slug`, `product_variants.slug`, `product_page_url`, and `single_product_url`.

**Bug:** it treated **any** live slug/URL leaf ending in `-2` as that uniqueness suffix. If the stem was free, it rewrote the original URL.

| Wrongly treated as uniqueness `-2` | After apply |
|---|---|
| `…-pack-of-2` (name is “Pack of 2”) | `…-pack-of` — original URL gone |
| Any product whose **name** slug already ends in `-2` | Same |

That is why original pack-of-2 (and similar) URLs disappeared instead of only a few collision `-2` URLs.

The script **does not** map variants, attach images, or change `product_type`. It only rewrites slugs and page-URL leaves.

## 2. Was there a rollback plan at apply time?

**No.** The script that was already run:

- Defaulted to dry-run unless `--apply`
- Logged before/after in **stdout only**
- Did **not** write a changelog JSON
- Had **no** `--rollback`
- Could not reverse itself after apply because the live rows no longer end in `-2`

So once `--apply` finished, rollback was only:

1. The console log from that run (if it was saved), or
2. A **database dump taken before apply**, restoring:
   - `products.slug`
   - `products.single_product_url`
   - `product_variants.slug`
   - `product_variants.product_page_url`
   - `product_variants.single_product_url`

Reindex / cache / sitemap **cannot** roll this back. They only republish whatever is in the DB now.

## 3. Why Typesense + cache + sitemap did not fix it

You ran:

```bash
npm run typesense:reindex
npm run cache:invalidate-products
npm run sitemap:generate
```

Those commands are **required after a slug change**, but they copy **current** DB slugs into search, Redis, and XML.

If the DB already has `…-pack-of` instead of `…-pack-of-2`, reindex and sitemap **publish the wrong URLs**. That is expected, not a second bug.

Do those three commands again **only after** slugs in Postgres are restored.

## 4. Why listing uses each variant URL (not a parent URL)

This is **combine + listing URL rules**, not the `-2` script (Flamingo leaf is `-s`, not `-2`).

### Did variant URLs change?

| Job | What it does to `product_variants.product_page_url` |
|---|---|
| **Combine simples** | **Does not rewrite it.** Each size keeps the URL it had as a simple product (`…-support-s`, `…-support-m`, …). Documented: SKU, `variantId`, and `product_page_url` stay on the variant row. |
| **`-2` slug repair** | Rewrites the URL **leaf** only when it ended in uniqueness `-2`. Flamingo `…-support-s` is unchanged. |

So after mapping, you still have **one URL per old simple**, not one parent URL for all sizes.

### Why the shop opens `…/flamingo-premium-ls-support-s`

1. Combine `targetProductRefId` was the **Small** simple. Parent `products.slug` stays that product’s slug (`…-support-s`). There is no automatic `flamingo-premium-ls-support` parent slug.
2. Listing cards prefer the **list variant’s unique** `productPageUrl` when no sibling shares it:

```text
uniqueListPageUrl = listVariant.productPageUrl
  if fewer than 2 variants share that same page URL
else
  fall back to category path + variant.slug
```

After combine, Small/Medium/XL each still have a **different** Woo URL, so `pageUrlOwners.length === 1`. The card link is that variant’s URL, **not** a shared parent.
3. PDP `permalink` is `matchedVariant.productPageUrl` (again the size URL).
4. Typesense indexes **one document per active variant**, each with that variant’s `productPageUrl`. Search / “listing” fed by search will show every size as its own hit with its own URL.

### Why all sizes still appear as listing cards

Category `GET /public/products` returns **one card per live product**, not per size.

If you still see Medium, XL, Large as separate cards, those rows are still **published simples** (`deleted_at` null). Combine only soft-deletes products that were in the assignment set. Sizes left out of the map stay on the PLP with their own image and URL.

PDP size pills (screenshot) are **not** listing cards. That is one variable parent. Expected.

### Why the image looks tied to one size / URL

Listing image = primary media of the **list variant** (or leftover simple). Combine remaps existing `product_media` onto the parent; it does not merge galleries into one parent hero. If each old simple had its own image on `variant_id`, each leftover listing card (or each Typesense hit) still shows that size’s image.

The `-2` script does not touch images.

### If you want one parent URL for all sizes

That is a **catalog change**, not a slug-repair rollback:

- Pick one canonical path (parent slug / one `product_page_url`).
- Point every sibling variant’s `product_page_url` at that same path (or clear them so permalink uses `products.slug`).
- Confirm other size products are soft-deleted.
- Then reindex / cache / sitemap.

Do not use `product:repair-live-variant-slugs` for this.

## 4b. Flamingo screenshot — not caused by the `-2` script

URL in the screenshot:

`/shop/pain-relief/supports-and-splints/flamingo-premium-ls-support-s`

Product: **Flamingo Premium LS Support Small OC2054**, size pills Medium / XXL / XL / Large / Small.

- The leaf is `-s` (Small), **not** `-2`. The `-2` job would not have targeted this path unless some other field ended in `-2`.
- Size pills on **PDP** after Combine simples → one variable product is **expected**. Mapping variants is supposed to show every assigned size on that parent page.
- Listing URL stays the **canonical parent** you picked as `targetProductRefId`. If you combined onto the Small SKU, the live URL keeps `…-support-s`. That is documented combine behaviour, not slug-strip fallout.

### If category **listing** still shows every size as its own card

That is a **different** problem from the `-2` script.

| Check | What you want |
|---|---|
| Parent `product_type` | `variable` |
| Other size products (Medium, XL, …) | `deleted_at` set (combine soft-deletes sources) |
| Category PLP API | **One card per product**, not per size. Cards use one preferred list variant (pack-of-1 / cheapest in stock). |
| Typesense | **One document per active variant**. Search/autocomplete can still list Small, Medium, XL as separate hits. That is by design today. |
| Sitemap | One loc per **product id**, not per size. |

If Medium / XL simples are still `published` and `deleted_at IS NULL`, they were **not** in the combine assignment set (or combine did not finish). Map them again onto the same parent, or unpublish/soft-delete leftovers. Do not run the `-2` slug script for this.

### Images after combine / “attach image”

The `-2` script never touches `product_media`.

Combine remaps:

- rows with `variant_id` set → parent `product_id`
- source **common** rows (`variant_id IS NULL`) → parent `product_id`

It does **not** invent per-size galleries. If images were product-level COMMON on each simple, they all land on the parent and every size can show the same gallery. Per-size images only show if each variant already had `product_media.variant_id` set **before** combine.

If PDP image is wrong: fix media on that `variantId` in admin (variant images, not only product COMMON). Then invalidate product cache. Not a slug rollback.

## 5. What to do now (no live URL ends in `-2`)

Do **not** re-apply the old repair. There is no `-2` left to strip, and a second apply cannot put `-2` back.

### Step A — Prefer a pre-apply DB dump (most accurate)

If a dump exists from **before** `product:repair-live-variant-slugs --apply`, restore **only** the slug/URL columns listed in section 2 (or restore the dump on a copy and copy those columns). Then run the three publish commands in section 6.

### Step B — If you still have the apply console log

Each line looks like:

`updated <refId> <sku>: product <old> → <new>; variant <old> → <new>`

Restore `old` on those rows. Do not guess.

### Step C — No dump and no log: restore from **product name** (dry-run first)

The live slug is now the **stem** (`…-pack-of`) while `generateProductSlug(name)` is still `…-pack-of-2`. Rollback does **not** look for URLs ending in `-2`.

```bash
# Preview only — writes reports/repair-live-variant-slugs/rollback-….json
npm run product:repair-live-variant-slugs -- --rollback
```

Review the preview:

- **Restore:** name contains Pack of 2 (or similar) and slug is missing that `-2`
- **Do not restore:** real uniqueness fixes such as `xyz-face-wash` (name is not `xyz-face-wash-2`)

Then:

```bash
npm run product:repair-live-variant-slugs -- --rollback --apply
```

If a later apply wrote `reports/repair-live-variant-slugs/repair-….json`, reverse that file instead:

```bash
npm run product:repair-live-variant-slugs -- --rollback --from=reports/repair-live-variant-slugs/repair-<timestamp>.json --apply
```

The **first** production apply did not write that file. `--from` only helps for runs **after** the changelog was added.

Skipped `genuine_collision` rows need the dump (another product now owns `…-pack-of-2`).

## 6. After slugs are restored

```bash
npm run typesense:reindex
npm run cache:invalidate-products
npm run sitemap:generate
```

Purge CDN / storefront cache for `/shop/...` product paths.

Spot-check:

- A known pack-of-2 PDP (old URL with `-2` must 200 again)
- A uniqueness repair that should stay **without** `-2` (must not come back)
- Flamingo parent PDP still one variable product with size pills
- Category listing card count for that parent = **1** if leftover simples are deleted

## 7. Code change after the incident (future runs only)

This does **not** undo the apply that already ran. It only stops the next `--apply` from stripping pack-of-2 names, and adds `--rollback`.

| Change | Why |
|---|---|
| Strip `-2` on the **product** only when `generateProductSlug(name)` equals the stem (name is **not** already `…-2`) | Pack of 2 / “2” in the title stays |
| Still repair `variant.slug = product.slug + '-2'` when that extra `-2` is not the name | Original parent-collision bug |
| `--rollback` restores name-based `…-2` that was stripped to the stem | Recovery when no `-2` URL remains |
| Changelog under `reports/repair-live-variant-slugs/` | Later reverse without a dump |
| Page URL rewrite skipped if the leaf is already the target | Avoid no-op URL writes |

Until you have restored production slugs, treat `--apply` (repair mode) as **blocked**.

## 8. Quick decision

| Symptom | Cause | Action |
|---|---|---|
| Pack-of-2 / original URL missing; slug no longer ends in `-2` | Original repair apply | Dump, log, or `--rollback` dry-run then apply; then reindex/cache/sitemap |
| Flamingo PDP shows all sizes | Combine onto one parent | Expected. Canonical URL is the parent you chose (here `…-support-s`) |
| Each size has its own URL, not one parent URL | Combine never rewrites `variant.product_page_url`; listing/PDP use that unique URL | Point all variants at one page URL, or clear them; not the `-2` script |
| Category listing shows every size as its own product | Leftover published simples, or frontend using Typesense variant docs as PLP | Check `deleted_at` / combine set; do not use `-2` script |
| Wrong / shared image on sizes | Media not variant-scoped; `-2` script not involved | Attach images on `variantId` |
| Search lists every size | Typesense one doc per variant | By design; not a slug bug |
