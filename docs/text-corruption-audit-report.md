# Cureka Unicode audit, repair engine, and execution plan

This report is the Phase 1–5 close-out. No database write was performed from this workspace. Do not run `--apply` until the backup and preview in section F are separately approved.

Regenerate the CSV numbers with:

```bash
npm run db:text-corruption:csv-audit -- --csv='/absolute/path/bulk-export-products (8).csv' --out=docs/text-corruption/reports
```

The latest local export used was `/Users/onetwothreefour/Downloads/bulk-export-products (8).csv` (UTF-8 BOM, 29 Oct 2026 01:51 IST). The ChatGPT Excel/JSON audit files were not in the workspace; counts below were recomputed from that CSV.

---

## A. Root cause report

### What persisted from the previous apply

The 29 October `--apply` **did commit** the 2,768 restorations, even though the pasted log stopped in the review dump and never showed `[commit] transaction committed`.

Evidence from CSV `(8)` versus the pre-apply dry-run samples:

| Pattern | CSV (8) count |
|---|---:|
| `GwhiteÂ®` / `Â°` / `Â®` / `â„¢` / `Ã¢â‚¬â„¢` / `crÃ¨me` | 0 |
| `Gwhite®` / `crème` | present |

The runner logged every pending field **before** `UPDATE`/`COMMIT`. That flood made the success trailer easy to miss. `failures=0` in the pre-write summary only meant the scan succeeded, not that the transaction committed. The runner now logs commit explicitly and re-scans after `COMMIT`.

### How the remaining corruption entered the catalog

Corruption is in the **stored catalog text**, not introduced by the UTF-8 CSV exporter (`bulk-upload-export-stream.service.ts` writes UTF-8 with BOM).

Most likely pipeline, with evidence:

1. **Source copy already mojibake or Word/Windows-1252.** Classic `Â®`, `â€™`, `Ëš`, and C1 `U+009D` (undefined Windows-1252 byte, often a leftover of `”`) match UTF-8 interpreted as Windows-1252, then stored as Unicode.
2. **Bulk import / Excel.** `bulk-upload-parser.service.ts` reads cells as UTF-8 and previously ran `repairUtf8Mojibake`, which decoded the **whole string or nothing**. Mixed Unicode plus one leftover `Â` or `â€` was left untouched. Excel C0 (`U+0007`) and LTR marks (`U+200E`) survived `sanitizeBulkUploadCellText` only partly (that helper strips bidi/BOM on import, but historical rows were loaded before it existed or via other paths).
3. **Not PostgreSQL client_encoding.** Remaining `�` (U+FFFD) means a conversion already replaced bytes before insert. PostgreSQL UTF-8 would not invent U+FFFD on a clean UTF-8 client.
4. **Not the latest export step.** The exporter does not recode to Latin-1.

Unknowns: which historical import file first wrote `beep[U+009D] sound` and `men���s`; whether any admin UI still posts Windows-1252.

Prevention now: parser and storefront share `repairText`; the bulk-upload validator rejects leftover `�`, undefined C1, C0, and incomplete `â€` after repair.

---

## B. Full Unicode audit (CSV 8)

Independently recomputed (cells, findings, and products are different units):

| Metric | Count |
|---|---:|
| Product records | 12,440 |
| Columns | 190 |
| Cells inspected | 2,363,600 |
| Flagged cells | 912 |
| Affected product rows | 797 |
| Findings (a cell can have more than one) | 943 |
| Distinct non-ASCII code points | 66 |
| SAFE_AUTO_REPAIR findings / cells | 72 / 72 |
| MANUAL_REVIEW findings / cells | 712 / 686 |
| SOURCE_REQUIRED findings / cells | 159 / 159 |

Category counts (findings, not cells):

| Category | Findings | Action |
|---|---:|---|
| `safe_auto_repair` | 72 | Deterministic restore (˚C/ºC → °C, stray `Â` before space, C0/LTR, defined C1) |
| `spaced_curly_quote` | 546 | Contextual; many are real quotations |
| `curly_quote_between_numbers` | 112 | Review numeric ranges |
| `c1_control_character` | 109 | Mostly `U+009D`; original glyph lost |
| `incomplete_punctuation_mojibake` | 43 | Incomplete `â€` |
| `ring_above_not_temperature` | 27 | `˚` not followed by C/F |
| `suspicious_small_tilde` | 16 | `˜` |
| `unrecoverable_replacement_character` | 7 | `�` (21 code points across 7 cells, e.g. `men���s`) |
| `suspicious_cent_sign` | 6 | `¢` (24 occurrences in 6 cells) |
| `soft_hyphen` | 3 | `U+00AD` |
| `malformed_numeric_expression` | 2 | `36.80.5 °C` family |

Valid characters that must remain include `₹ ° ± × ® ™ é β ≤ ’ — –`. `Â` (U+00C2) is a real letter in some languages; in this CSV the remaining uses next to ASCII space are encoding leftovers and are classified as auto-repair. `SÃO` is preserved.

External ChatGPT files (`cureka_latest_csv_unicode_audit.xlsx` and friends) were not present; do not treat their 894/118/83 split as this engine's counts.

---

## C. Repair implementation

Files changed:

- `apps/api/database/scripts/text-corruption-repair.ts` — mixed decoder plus C1 map, stray lead-byte strip, `˚C`/`ºC`, C0/bidi strip
- `apps/api/database/scripts/text-corruption-policy.ts` — proposed allowlist and statuses
- `apps/api/database/scripts/text-corruption-csv-audit.ts` — local CSV auditor
- `apps/api/database/scripts/audit-text-corruption-csv.runner.ts`
- `apps/api/database/scripts/cleanup-text-corruption.runner.ts` — JSONB `::jsonb`, sample-sized logs, post-commit rescan
- `modules/public/utils/repair-utf8-mojibake.ts` — delegates to `repairText`
- `modules/product/services/bulk-upload-validator.service.ts` — rejects remaining forbidden fragments
- tests and `package.json` script `db:text-corruption:csv-audit`

JSON keys, non-strings, UUIDs, and numeric JSON values are still not modified. HTML tags and percent-encoded URLs are left intact unless they contain the same catalog mojibake.

Out of current DB runner scope: `Manufacturer Name` and `Country of Origin` come from master tables, not `products` / `product_variants` / `product_faqs` / `blog_posts`. Three LTR-mark auto-repairs sit on those export columns.

---

## D. Repair preview

Full per-cell before/after for the 72 auto-repairs: `docs/text-corruption/reports/repair-manifest.json`.

Examples (CSV row numbers are 1-based including header):

| CSV row | Column | Before (excerpt) | After |
|---|---|---|---|
| 2035 | Meta Title | `NestleÂ Baby Cereal` | `Nestle Baby Cereal` |
| 1874 | FAQ 4 Answer | `36ºC and 37.2ºC` | `36°C and 37.2°C` |
| 1864 | FAQ 2 Question | `ËšC or ËšF` already stored as `˚C` | `°C or °F` |
| 2163 | Meta Description | C1 `U+0092` | `’` |
| 3691 | FAQ 2 Question | BEL `U+0007` | stripped |
| 142 | FAQ 1 Question | `beep[U+009D] sound` | unchanged; SOURCE_REQUIRED |
| 1645 | Search Tags | `water â€ insoluable` | unchanged; SOURCE_REQUIRED |
| 1863 | FAQ 3 Question | `36.80.5 °C` | unchanged; do not infer `±` |
| 8806 | Search Tags | `men���s` | unchanged; do not guess `men's` |

Primary keys for a database apply are **not** in the CSV. The next `--dry-run` must print table/column/PK groups; use that list, not CSV row numbers, as the apply manifest.

---

## E. Test report

```text
npx jest apps/api/database/scripts/cleanup-text-corruption.runner.spec.ts \
  apps/api/database/scripts/text-corruption-csv-audit.spec.ts \
  modules/public/utils/storefront-text.util.spec.ts --runInBand
```

Result: **3 suites, 98 tests, all passed.** No database connection. Coverage includes audit patterns, C1, stray `Â`, `SÃO` preservation, emoji ZWJ, JSON keys, URLs, incomplete `â€`, `�`, malformed `36.80.5 °C`, JSONB parameter casts, commit/rollback, and CSV classification.

---

## F. Database execution safety (stop for approval)

Cursor will not connect to `8.231.74.20`. An operator must run the following **after** approval.

### Read-only confirmation

```bash
TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE=true \
TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM=I_UNDERSTAND_THIS_IS_REMOTE_CUREKA_DATABASE \
TEXT_CORRUPTION_CLEANUP_EXPECTED_HOST=8.231.74.20 \
TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE=cureka_db \
npm run db:text-corruption:dry-run
```

Expect a **new** preview id (the engine changed). Candidate count should be on the order of the 72 CSV auto-repairs, plus any matching blog/product_information JSON pointers, minus master-table-only fields. Review leftovers in the hundreds are expected (`U+009D`, `â€`, `�`).

### Backup

Do **not** reuse `/home/tech/cureka-db-backups-23-oct/cureka_full_backup_20261023.dump` or `/home/tech/db-backups/cureka_backup_20261028_200724.dump` as the rollback point for this second apply: both predate the 2,768 restorations. Take a new custom-format dump **after** those restorations, then:

```bash
ls -l /absolute/new.dump
pg_restore --list /absolute/new.dump | head
```

Require `Format: CUSTOM` and `dbname: cureka_db`. Listing is not a restore test. An isolated restore rehearsal is still recommended and is not done by this runner.

### Apply (template only)

```bash
TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE=true \
TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM=I_UNDERSTAND_THIS_IS_REMOTE_CUREKA_DATABASE \
TEXT_CORRUPTION_CLEANUP_EXPECTED_HOST=8.231.74.20 \
TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE=cureka_db \
TEXT_CORRUPTION_CLEANUP_BACKUP_PATH='/absolute/new.dump' \
TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET=8.231.74.20/cureka_db \
TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW='<preview-id-from-this-dry-run>' \
npm run db:text-corruption:apply
```

Updates stay per primary key and original value, batched, inside one transaction. Success must show:

```text
[commit] transaction committed
post-commit repairable matches=0
```

Then `npm run cache:invalidate-products` and a fresh bulk export for a second CSV audit.

---

## G. Remaining manual-review / source-required

Full list: `docs/text-corruption/reports/unresolved-report.json` and `flagged-cells.csv`.

Cannot auto-repair:

- **109 C1 `U+009D` cells** (example CSV 142 FAQ 1 Question `beep[U+009D] sound`). Need original catalog punctuation.
- **43 incomplete `â€`** (example `water â€ insoluable`). Could have been `–`, `—`, or `”`.
- **7 cells with `�`** (21 replacement characters; example `men���s`). Never guess `men's`.
- **2 malformed measurements** (`36.80.5 °C`). Never infer `±`.
- **546 spaced curly quotes** and **112 quotes between digits** — many valid; review only where they replaced a dash or operator.
- **27 `˚` not before C/F**, **16 `˜`**, **6 `¢` cells**, **3 soft hyphens**.

---

## H. Engineering score (evidence-based)

| Area | Score | Why not 10 |
|---|---:|---|
| Unicode detection | 8 | CSV audit is complete for this export; SQL detector still does not flag `¢` / spaced quotes (intentional) |
| Restoration accuracy | 8 | 72 deterministic fixes; `â€` / `�` / `U+009D` cannot be restored |
| Data preservation | 9 | `SÃO`, emoji ZWJ, JSON keys, URLs covered by tests |
| JSONB safety | 8 | `::jsonb` casts added; not live-verified on PG 18 in this session |
| Medical measurement integrity | 8 | `36.80.5 °C` left untouched; `˚C`/`ºC` only when unit letter is present |
| Test coverage | 8 | 98 passing unit tests; no live DB integration test |
| Database execution safety | 8 | Gates intact; previous apply log was incomplete; post-commit verify added; restore rehearsal still not done |
| Import prevention | 7 | Shared repair + validator reject; historical rows already stored |
| Final data quality | 6 | Forbidden leftovers remain until source-required cells are rewritten |

Zero known **repairable** forbidden patterns after a verified second apply is the target. Zero leftover `�` / `â€` / `U+009D` is **not** claimed and requires supplier text.
