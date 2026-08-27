/**
 * Populate categories.above_the_fold from the Cureka category page descriptions workbook.
 *
 * Resolves each URL path after `/product-category/` via slug + parent hierarchy
 * (never by leaf slug alone). Updates only the final matched category.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run category:above-the-fold
 *   npm run category:above-the-fold -- --apply
 *   npm run category:above-the-fold -- --file="docs/Master-Data-Sheets/cureka_category_page_descriptions_above the fold.xlsx" --apply
 *   npm run category:above-the-fold -- --limit=20
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';

const DEFAULT_FILE =
  'docs/Master-Data-Sheets/cureka_category_page_descriptions_above the fold.xlsx';

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
}

interface SheetInputRow {
  sheetName: string;
  sheetRow: number;
  urlRaw: string;
  pathKey: string;
  slugPath: string[];
  description: string;
}

interface CategoryRow {
  id: string;
  slug: string;
  parentId: string | null;
  aboveTheFold: string | null;
  name: string;
  refId: string;
}

interface PlannedUpdate {
  categoryId: string;
  refId: string;
  name: string;
  pathKey: string;
  description: string;
  previous: string | null;
}

type Stats = {
  sheetsProcessed: number;
  rowsProcessed: number;
  successfullyUpdated: number;
  alreadyMatching: number;
  skippedEmptyDescription: number;
  unmatchedUrls: number;
  duplicateUrls: number;
  conflictingDescriptions: number;
  ambiguousMatches: number;
  errors: number;
};

const ROOT_PARENT_KEY = '__ROOT__';

const absolutePath = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.cwd(), p);

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'hyperlink' in v) {
    const link = v as ExcelJS.CellHyperlinkValue;
    // Prefer the actual URL for link columns; fall back to display text.
    return String(link.hyperlink ?? link.text ?? '').trim();
  }
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: string }).text).trim();
  }
  if (typeof v === 'object' && 'result' in v) {
    const result = (v as ExcelJS.CellFormulaValue).result;
    return result == null ? '' : String(result).trim();
  }
  return String(v).trim();
};

const printUsage = (): void => {
  console.log(`
category:above-the-fold — Populate categories.above_the_fold from Excel

Options:
  --file <path>   XLSX file  (default: ${DEFAULT_FILE})
  --apply         Persist changes to DB (default: dry-run)
  --limit <n>     Process at most N data rows across the workbook
  --help          Show this help
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { file: DEFAULT_FILE, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') {
      opts.apply = true;
      continue;
    }
    if (arg === '--file' || arg.startsWith('--file=')) {
      opts.file = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? opts.file;
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw = arg.includes('=') ? arg.split('=')[1] : argv[++i];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) opts.limit = Math.trunc(n);
    }
  }
  return opts;
};

/**
 * Extract slug segments after /product-category/ (or /categories/).
 * Removes domain, query, fragment, trailing slash; decodes URI parts.
 */
const parseCategoryPath = (url: string): string[] | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;

  let pathname = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      pathname = parsed.pathname;
    } else if (trimmed.includes('?') || trimmed.includes('#')) {
      pathname = trimmed.split(/[?#]/)[0] ?? trimmed;
    }
  } catch {
    return null;
  }

  pathname = pathname.replace(/\/+$/, '');
  const match = pathname.match(/\/(?:product-category|categories)\/(.+)$/i);
  if (!match?.[1]) return null;

  try {
    const parts = match[1]
      .split('/')
      .map((part) => decodeURIComponent(part).trim().toLowerCase())
      .filter(Boolean);
    return parts.length ? parts : null;
  } catch {
    return null;
  }
};

const detectColumns = (
  worksheet: ExcelJS.Worksheet,
): { urlCol: number; previewCol: number } | null => {
  let urlCol = 0;
  let previewCol = 0;

  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (
      header === 'url list' ||
      header === 'url' ||
      header === 'links' ||
      header === 'link'
    ) {
      urlCol = colNumber;
    } else if (header === 'preview description' || header === 'preview') {
      previewCol = colNumber;
    }
  });

  if (!urlCol || !previewCol) return null;
  return { urlCol, previewCol };
};

const readWorkbookRows = (
  workbook: ExcelJS.Workbook,
  limit?: number,
): { rows: SheetInputRow[]; sheetsProcessed: number; emptyDescription: number; errors: number } => {
  const rows: SheetInputRow[] = [];
  let sheetsProcessed = 0;
  let emptyDescription = 0;
  let errors = 0;

  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount < 2) continue;
    const cols = detectColumns(worksheet);
    if (!cols) {
      console.log(`[above-the-fold] skip sheet "${worksheet.name}" — missing URL/Preview columns`);
      continue;
    }
    sheetsProcessed += 1;

    for (let r = 2; r <= worksheet.rowCount; r++) {
      if (limit != null && rows.length >= limit) {
        return { rows, sheetsProcessed, emptyDescription, errors };
      }

      const row = worksheet.getRow(r);
      const urlRaw = normalizeText(row.getCell(cols.urlCol));
      const description = normalizeText(row.getCell(cols.previewCol));

      if (!urlRaw && !description) continue;

      if (!description) {
        emptyDescription += 1;
        continue;
      }

      if (!urlRaw) {
        errors += 1;
        console.warn(
          `[above-the-fold] ERROR empty URL with description sheet="${worksheet.name}" row=${r}`,
        );
        continue;
      }

      const slugPath = parseCategoryPath(urlRaw);
      if (!slugPath) {
        // Counted later as unmatched when resolving; keep raw for logging.
        rows.push({
          sheetName: worksheet.name,
          sheetRow: r,
          urlRaw,
          pathKey: '',
          slugPath: [],
          description,
        });
        continue;
      }

      rows.push({
        sheetName: worksheet.name,
        sheetRow: r,
        urlRaw,
        pathKey: slugPath.join('/'),
        slugPath,
        description,
      });
    }
  }

  return { rows, sheetsProcessed, emptyDescription, errors };
};

const parentKey = (parentId: string | null): string => parentId ?? ROOT_PARENT_KEY;

const lookupKey = (parentId: string | null, slug: string): string =>
  `${parentKey(parentId)}|${slug.trim().toLowerCase()}`;

const loadCategories = async (): Promise<CategoryRow[]> => {
  return AppDataSource.query<CategoryRow[]>(
    `
      SELECT
        id,
        slug,
        parent_category_id AS "parentId",
        above_the_fold AS "aboveTheFold",
        name,
        ref_id AS "refId"
      FROM categories
      WHERE deleted_at IS NULL
    `,
  );
};

const buildCategoryIndex = (
  categories: CategoryRow[],
): Map<string, CategoryRow[]> => {
  const index = new Map<string, CategoryRow[]>();
  for (const category of categories) {
    const key = lookupKey(category.parentId, category.slug);
    const list = index.get(key) ?? [];
    list.push(category);
    index.set(key, list);
  }
  return index;
};

/**
 * Walk slugPath: root (parent null) → child → … → leaf.
 * Returns the leaf category, or a failure reason.
 */
const resolveHierarchy = (
  slugPath: string[],
  index: Map<string, CategoryRow[]>,
):
  | { ok: true; category: CategoryRow }
  | { ok: false; reason: 'unmatched' | 'ambiguous'; detail: string } => {
  let parentId: string | null = null;
  let current: CategoryRow | null = null;

  for (let i = 0; i < slugPath.length; i++) {
    const slug = slugPath[i];
    const matches = index.get(lookupKey(parentId, slug)) ?? [];
    if (matches.length === 0) {
      return {
        ok: false,
        reason: 'unmatched',
        detail: `${slugPath.slice(0, i + 1).join(' → ')} (missing slug="${slug}" under parent=${parentId ?? 'ROOT'})`,
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        detail: `${slugPath.slice(0, i + 1).join(' → ')} (${matches.length} categories with slug="${slug}" under same parent)`,
      };
    }
    current = matches[0];
    parentId = current.id;
  }

  if (!current) {
    return { ok: false, reason: 'unmatched', detail: 'empty path' };
  }
  return { ok: true, category: current };
};

const collapseByPath = (
  rows: SheetInputRow[],
  stats: Stats,
): Map<string, { description: string; samples: SheetInputRow[] }> => {
  const byPath = new Map<string, { description: string; samples: SheetInputRow[] }>();
  const conflicts = new Set<string>();

  for (const row of rows) {
    if (!row.pathKey) {
      stats.unmatchedUrls += 1;
      console.warn(
        `[above-the-fold] UNMATCHED invalid/missing /product-category/ path sheet="${row.sheetName}" row=${row.sheetRow} url="${row.urlRaw}"`,
      );
      continue;
    }

    const existing = byPath.get(row.pathKey);
    if (!existing) {
      byPath.set(row.pathKey, { description: row.description, samples: [row] });
      continue;
    }

    existing.samples.push(row);
    stats.duplicateUrls += 1;

    if (existing.description === row.description) {
      continue;
    }

    if (!conflicts.has(row.pathKey)) {
      conflicts.add(row.pathKey);
      stats.conflictingDescriptions += 1;
      console.warn(
        `[above-the-fold] CONFLICT path="${row.pathKey}" — differing Preview Description; skipping category`,
      );
      console.warn(`  first:  ${existing.description.slice(0, 120)}`);
      console.warn(`  later:  ${row.description.slice(0, 120)} (sheet="${row.sheetName}" row=${row.sheetRow})`);
    }
  }

  for (const pathKey of conflicts) {
    byPath.delete(pathKey);
  }

  return byPath;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`[above-the-fold] file=${filePath}`);
  console.log(`[above-the-fold] apply=${opts.apply}${opts.limit ? ` limit=${opts.limit}` : ''}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const stats: Stats = {
    sheetsProcessed: 0,
    rowsProcessed: 0,
    successfullyUpdated: 0,
    alreadyMatching: 0,
    skippedEmptyDescription: 0,
    unmatchedUrls: 0,
    duplicateUrls: 0,
    conflictingDescriptions: 0,
    ambiguousMatches: 0,
    errors: 0,
  };

  const read = readWorkbookRows(workbook, opts.limit);
  stats.sheetsProcessed = read.sheetsProcessed;
  stats.skippedEmptyDescription = read.emptyDescription;
  stats.errors += read.errors;
  stats.rowsProcessed = read.rows.length + read.emptyDescription;

  const byPath = collapseByPath(read.rows, stats);

  await AppDataSource.initialize();
  try {
    const categories = await loadCategories();
    const index = buildCategoryIndex(categories);
    console.log(`[above-the-fold] loaded categories=${categories.length} uniquePaths=${byPath.size}`);

    const planned: PlannedUpdate[] = [];

    for (const [pathKey, entry] of byPath) {
      const slugPath = pathKey.split('/');
      const resolved = resolveHierarchy(slugPath, index);
      if (!resolved.ok) {
        if (resolved.reason === 'ambiguous') {
          stats.ambiguousMatches += 1;
          console.warn(`[above-the-fold] AMBIGUOUS ${resolved.detail}`);
        } else {
          stats.unmatchedUrls += 1;
          console.warn(`[above-the-fold] UNMATCHED ${resolved.detail}`);
        }
        continue;
      }

      const category = resolved.category;
      if ((category.aboveTheFold ?? '') === entry.description) {
        stats.alreadyMatching += 1;
        continue;
      }

      planned.push({
        categoryId: category.id,
        refId: category.refId,
        name: category.name,
        pathKey,
        description: entry.description,
        previous: category.aboveTheFold,
      });
    }

    console.log(`[above-the-fold] planned updates=${planned.length}`);

    if (!opts.apply) {
      for (const item of planned.slice(0, 10)) {
        console.log(
          `[above-the-fold] DRY-RUN would update ${item.refId} "${item.name}" path=${item.pathKey}`,
        );
      }
      if (planned.length > 10) {
        console.log(`[above-the-fold] DRY-RUN … and ${planned.length - 10} more`);
      }
    } else if (planned.length > 0) {
      await AppDataSource.transaction(async (manager) => {
        for (const item of planned) {
          await manager.query(
            `
              UPDATE categories
              SET above_the_fold = $1,
                  updated_at = NOW(),
                  updated_by = $2
              WHERE id = $3
                AND deleted_at IS NULL
            `,
            [item.description, 'category-above-the-fold-script', item.categoryId],
          );
          stats.successfullyUpdated += 1;
        }
      });
      console.log(`[above-the-fold] applied updates=${stats.successfullyUpdated}`);
    }

    if (!opts.apply) {
      // In dry-run, report how many would update under "Successfully updated" as 0;
      // show planned count separately above. Keep Successfully updated = 0 until --apply.
      console.log(`[above-the-fold] dry-run complete (pass --apply to write)`);
    }
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }

  console.log(`
Total sheets processed: ${stats.sheetsProcessed}
Total rows processed: ${stats.rowsProcessed}
Successfully updated: ${stats.successfullyUpdated}
Already matching: ${stats.alreadyMatching}
Skipped - empty description: ${stats.skippedEmptyDescription}
Unmatched URLs: ${stats.unmatchedUrls}
Duplicate URLs: ${stats.duplicateUrls}
Conflicting descriptions: ${stats.conflictingDescriptions}
Ambiguous matches: ${stats.ambiguousMatches}
Errors: ${stats.errors}
`);
}

run().catch((error) => {
  console.error('[above-the-fold] fatal', error);
  process.exit(1);
});
