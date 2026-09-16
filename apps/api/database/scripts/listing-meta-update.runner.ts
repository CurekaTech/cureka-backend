/**
 * Update brand, category, and health-concern SEO meta from the Cureka meta sheet.
 *
 * Sheets:
 *   Brands          → brands.meta_title / meta_description           (match ref_id, then slug)
 *   Health concern  → health_concerns.meta_title / meta_description (match ref_id, then slug)
 *   Categories      → categories.meta_title / meta_description       (match URL slug-path, then slug, then name)
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run listing:meta-update
 *   npm run listing:meta-update -- --apply
 *   npm run listing:meta-update -- --file="docs/Master-Data-Sheets/meta-content-cureka.xlsx" --apply
 *   npm run listing:meta-update -- --only=brands,categories --apply
 *   npm run listing:meta-update -- --sql-out="docs/Master-Data-Sheets/listing-meta-update.sql"
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import Redis from 'ioredis';
import { writeFileSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { CacheKeys } from '../../../../packages/cache/src/cache-keys.factory';
import { buildRedisClientOptions } from '../../../../packages/cache/src/redis-options.util';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/meta-content-cureka.xlsx';
const META_TITLE_MAX = 255;

type EntityKind = 'brands' | 'health-concerns' | 'categories';

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
  only: Set<EntityKind>;
  sqlOut?: string;
}

interface SheetRow {
  name: string;
  refId: string;
  slug: string;
  slugPath: string[];
  metaTitle: string;
  metaDescription: string;
  sheetRow: number;
}

interface DbRow {
  id: string;
  refId: string;
  name: string;
  slug: string;
  parentId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

interface UpdateTarget {
  kind: EntityKind;
  id: string;
  refId: string;
  name: string;
  slug: string;
  matchedBy: string;
  metaTitle: string;
  metaDescription: string;
  currentTitle: string | null;
  currentDescription: string | null;
}

const ALL_KINDS: EntityKind[] = ['brands', 'health-concerns', 'categories'];

const absolutePath = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.cwd(), p);

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'hyperlink' in v) {
    const link = v;
    return String(link.text ?? link.hyperlink ?? '').trim();
  }
  if (typeof v === 'object' && 'richText' in v) {
    return (v).richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: string }).text).trim();
  }
  return String(v).trim();
};

const clipTitle = (value: string): string =>
  value.length <= META_TITLE_MAX ? value : value.slice(0, META_TITLE_MAX).trim();

const normalizeName = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const parseCategoryPath = (url: string): string[] => {
  const trimmed = url.trim();
  if (!trimmed) return [];
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/(?:product-category|categories)\/(.+?)\/?$/i);
    if (!match?.[1]) return [];
    return match[1]
      .split('/')
      .map((part) => decodeURIComponent(part).trim())
      .filter(Boolean);
  } catch {
    const match = trimmed.match(/\/(?:product-category|categories)\/(.+?)\/?$/i);
    if (!match?.[1]) return [];
    return match[1]
      .split('/')
      .map((part) => decodeURIComponent(part).trim())
      .filter(Boolean);
  }
};

const printUsage = (): void => {
  console.log(`
listing:meta-update — Update brand / category / health-concern meta from the sheet

Options:
  --file <path>   XLSX file  (default: ${DEFAULT_FILE})
  --apply         Persist changes to DB (default: dry-run)
  --sql-out <path> Write SQL instead of connecting to the database
  --limit <n>     Process at most N rows per sheet
  --only <list>   Comma-separated: brands,health-concerns,categories
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { file: DEFAULT_FILE, apply: false, only: new Set(ALL_KINDS) };
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
      continue;
    }
    if (arg === '--sql-out' || arg.startsWith('--sql-out=')) {
      opts.sqlOut = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }
    if (arg === '--only' || arg.startsWith('--only=')) {
      const raw = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? '';
      const kinds = raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item): item is EntityKind => (ALL_KINDS as string[]).includes(item));
      if (kinds.length) opts.only = new Set(kinds);
    }
  }
  return opts;
};

const sqlString = (value: string | null | undefined): string => {
  if (value == null || value === '') return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
};

const writeSqlFile = (outputPath: string, rowsByKind: Record<EntityKind, SheetRow[]>): void => {
  const lines: string[] = [
    '-- Listing SEO meta update generated from meta-content-cureka.xlsx',
    'BEGIN;',
    '',
    'ALTER TABLE "health_concerns" ADD COLUMN IF NOT EXISTS "meta_title" character varying(255);',
    'ALTER TABLE "health_concerns" ADD COLUMN IF NOT EXISTS "meta_description" text;',
    '',
    'CREATE TEMP TABLE listing_meta_updates (',
    '  kind text NOT NULL,',
    '  ref_id text,',
    '  slug text,',
    '  slug_path text,',
    '  name text,',
    '  meta_title text,',
    '  meta_description text',
    ');',
    '',
  ];

  const insertRows = (kind: string, rows: SheetRow[]): void => {
    if (!rows.length) return;
    const values = rows.map(
      (row) =>
        `(${sqlString(kind)}, ${sqlString(row.refId || null)}, ${sqlString(row.slug || null)}, ${sqlString(row.slugPath.join('/') || null)}, ${sqlString(row.name || null)}, ${sqlString(row.metaTitle || null)}, ${sqlString(row.metaDescription || null)})`,
    );
    const chunkSize = 200;
    for (let i = 0; i < values.length; i += chunkSize) {
      lines.push(
        'INSERT INTO listing_meta_updates (kind, ref_id, slug, slug_path, name, meta_title, meta_description) VALUES',
      );
      lines.push(`${values.slice(i, i + chunkSize).join(',\n')};`);
      lines.push('');
    }
  };

  insertRows('brand', rowsByKind.brands);
  insertRows('health-concern', rowsByKind['health-concerns']);
  insertRows('category', rowsByKind.categories);

  lines.push(`
UPDATE brands AS b
SET meta_title = u.meta_title,
    meta_description = u.meta_description,
    updated_at = NOW()
FROM listing_meta_updates AS u
WHERE u.kind = 'brand'
  AND b.deleted_at IS NULL
  AND (
    (u.ref_id IS NOT NULL AND b.ref_id = u.ref_id)
    OR (u.ref_id IS NULL AND u.slug IS NOT NULL AND b.slug = u.slug)
  );

UPDATE health_concerns AS h
SET meta_title = u.meta_title,
    meta_description = u.meta_description,
    updated_at = NOW()
FROM listing_meta_updates AS u
WHERE u.kind = 'health-concern'
  AND h.deleted_at IS NULL
  AND (
    (u.ref_id IS NOT NULL AND h.ref_id = u.ref_id)
    OR (u.ref_id IS NULL AND u.slug IS NOT NULL AND h.slug = u.slug)
  );

WITH RECURSIVE cat_path AS (
  SELECT id, slug, parent_category_id, slug::text AS path
  FROM categories
  WHERE deleted_at IS NULL AND parent_category_id IS NULL
  UNION ALL
  SELECT c.id, c.slug, c.parent_category_id, cat_path.path || '/' || c.slug
  FROM categories c
  JOIN cat_path ON c.parent_category_id = cat_path.id
  WHERE c.deleted_at IS NULL
)
UPDATE categories AS c
SET meta_title = u.meta_title,
    meta_description = u.meta_description,
    updated_at = NOW()
FROM listing_meta_updates AS u
JOIN cat_path AS p ON p.path = u.slug_path
WHERE u.kind = 'category'
  AND u.slug_path IS NOT NULL
  AND c.id = p.id;

UPDATE categories AS c
SET meta_title = u.meta_title,
    meta_description = u.meta_description,
    updated_at = NOW()
FROM listing_meta_updates AS u
WHERE u.kind = 'category'
  AND u.slug IS NOT NULL
  AND c.deleted_at IS NULL
  AND c.slug = u.slug
  AND (c.meta_title IS DISTINCT FROM u.meta_title OR c.meta_description IS DISTINCT FROM u.meta_description)
  AND NOT EXISTS (
    SELECT 1 FROM categories other
    WHERE other.deleted_at IS NULL
      AND other.slug = c.slug
      AND other.id <> c.id
  );

COMMIT;
`);

  writeFileSync(outputPath, lines.join('\n'), 'utf8');
};

const detectColumns = (worksheet: ExcelJS.Worksheet) => {
  let nameCol = 0;
  let refIdCol = 0;
  let slugCol = 0;
  let urlCol = 0;
  let metaTitleCol = 0;
  let metaDescCol = 0;

  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (
      header === 'brand name' ||
      header === 'category name' ||
      header === 'health concern name' ||
      header === 'name'
    ) {
      nameCol = colNumber;
    } else if (header === 'ref id' || header === 'refid' || header === 'id') {
      refIdCol = colNumber;
    } else if (header === 'slug') {
      slugCol = colNumber;
    } else if (header === 'url') {
      urlCol = colNumber;
    } else if (header === 'meta title') {
      metaTitleCol = colNumber;
    } else if (header === 'meta description' || header === 'meta desc') {
      metaDescCol = colNumber;
    }
  });

  return { nameCol, refIdCol, slugCol, urlCol, metaTitleCol, metaDescCol };
};

const readSheetRows = (worksheet: ExcelJS.Worksheet, kind: EntityKind): SheetRow[] => {
  const cols = detectColumns(worksheet);
  if (!cols.metaTitleCol || !cols.metaDescCol) {
    throw new Error(`Sheet "${worksheet.name}" is missing Meta Title / Meta Description columns`);
  }
  if (kind !== 'categories' && !cols.refIdCol && !cols.slugCol) {
    throw new Error(`Sheet "${worksheet.name}" needs a Ref ID or Slug column`);
  }

  const rows: SheetRow[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const name = cols.nameCol ? normalizeText(row.getCell(cols.nameCol)) : '';
    const refId = cols.refIdCol ? normalizeText(row.getCell(cols.refIdCol)) : '';
    const url = cols.urlCol ? normalizeText(row.getCell(cols.urlCol)) : '';
    const slugPath = parseCategoryPath(url);
    const slugFromUrl = slugPath[slugPath.length - 1] ?? '';
    const slug = (cols.slugCol ? normalizeText(row.getCell(cols.slugCol)) : '') || slugFromUrl;
    const metaTitle = clipTitle(cols.metaTitleCol ? normalizeText(row.getCell(cols.metaTitleCol)) : '');
    const metaDescription = cols.metaDescCol ? normalizeText(row.getCell(cols.metaDescCol)) : '';

    if (!name && !refId && !slug) continue;
    if (!metaTitle && !metaDescription) continue;

    rows.push({ name, refId, slug, slugPath, metaTitle, metaDescription, sheetRow: r });
  }
  return rows;
};

const loadDbRows = async (
  table: 'brands' | 'health_concerns' | 'categories',
): Promise<DbRow[]> => {
  return AppDataSource.query<DbRow[]>(
    `
      SELECT
        id,
        ref_id AS "refId",
        name,
        slug,
        ${table === 'categories' ? 'parent_category_id' : 'NULL'} AS "parentId",
        meta_title AS "metaTitle",
        meta_description AS "metaDescription"
      FROM ${table}
      WHERE deleted_at IS NULL
    `,
  );
};

const buildCategorySlugPath = (row: DbRow, byId: Map<string, DbRow>): string => {
  const parts = [row.slug];
  const seen = new Set<string>([row.id]);
  let parentId = row.parentId;
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    parts.unshift(parent.slug);
    parentId = parent.parentId;
  }
  return parts.join('/');
};

const matchBrandOrConcern = (
  kind: EntityKind,
  sheetRows: SheetRow[],
  dbRows: DbRow[],
): { targets: UpdateTarget[]; notFound: string[] } => {
  const byRefId = new Map(dbRows.map((row) => [row.refId.trim().toLowerCase(), row]));
  const bySlug = new Map<string, DbRow[]>();
  for (const row of dbRows) {
    const key = row.slug.trim().toLowerCase();
    const list = bySlug.get(key) ?? [];
    list.push(row);
    bySlug.set(key, list);
  }

  const targets: UpdateTarget[] = [];
  const notFound: string[] = [];
  const seen = new Set<string>();

  for (const sheet of sheetRows) {
    let match: DbRow | undefined;
    let matchedBy = '';

    if (sheet.refId) {
      match = byRefId.get(sheet.refId.toLowerCase());
      if (match) matchedBy = 'ref_id';
    }
    if (!match && sheet.slug) {
      const slugMatches = bySlug.get(sheet.slug.toLowerCase()) ?? [];
      if (slugMatches.length === 1) {
        match = slugMatches[0];
        matchedBy = 'slug';
      }
    }

    if (!match) {
      notFound.push(`${sheet.name || sheet.slug || sheet.refId} (row ${sheet.sheetRow})`);
      continue;
    }
    if (seen.has(match.id)) continue;
    seen.add(match.id);

    targets.push({
      kind,
      id: match.id,
      refId: match.refId,
      name: match.name,
      slug: match.slug,
      matchedBy,
      metaTitle: sheet.metaTitle,
      metaDescription: sheet.metaDescription,
      currentTitle: match.metaTitle,
      currentDescription: match.metaDescription,
    });
  }

  return { targets, notFound };
};

const matchCategories = (
  sheetRows: SheetRow[],
  dbRows: DbRow[],
): { targets: UpdateTarget[]; notFound: string[] } => {
  const byId = new Map(dbRows.map((row) => [row.id, row]));
  const byPath = new Map<string, DbRow>();
  const bySlug = new Map<string, DbRow[]>();
  const byName = new Map<string, DbRow[]>();

  for (const row of dbRows) {
    byPath.set(buildCategorySlugPath(row, byId), row);
    const slugKey = row.slug.trim().toLowerCase();
    const slugList = bySlug.get(slugKey) ?? [];
    slugList.push(row);
    bySlug.set(slugKey, slugList);
    const nameKey = normalizeName(row.name);
    const nameList = byName.get(nameKey) ?? [];
    nameList.push(row);
    byName.set(nameKey, nameList);
  }

  const targets: UpdateTarget[] = [];
  const notFound: string[] = [];
  const seen = new Set<string>();

  for (const sheet of sheetRows) {
    let match: DbRow | undefined;
    let matchedBy = '';

    if (sheet.slugPath.length) {
      match = byPath.get(sheet.slugPath.join('/'));
      if (match) matchedBy = 'slug_path';
    }

    if (!match && sheet.slug) {
      const slugMatches = bySlug.get(sheet.slug.toLowerCase()) ?? [];
      if (slugMatches.length === 1) {
        match = slugMatches[0];
        matchedBy = 'slug';
      }
    }

    if (!match && sheet.name) {
      const nameMatches = byName.get(normalizeName(sheet.name)) ?? [];
      if (nameMatches.length === 1) {
        match = nameMatches[0];
        matchedBy = 'name';
      }
    }

    if (!match) {
      notFound.push(`${sheet.name || sheet.slug} (row ${sheet.sheetRow})`);
      continue;
    }
    if (seen.has(match.id)) continue;
    seen.add(match.id);

    targets.push({
      kind: 'categories',
      id: match.id,
      refId: match.refId,
      name: match.name,
      slug: match.slug,
      matchedBy,
      metaTitle: sheet.metaTitle,
      metaDescription: sheet.metaDescription,
      currentTitle: match.metaTitle,
      currentDescription: match.metaDescription,
    });
  }

  return { targets, notFound };
};

const changed = (target: UpdateTarget): boolean =>
  (target.currentTitle ?? '') !== target.metaTitle ||
  (target.currentDescription ?? '') !== target.metaDescription;

const tableFor = (kind: EntityKind): 'brands' | 'health_concerns' | 'categories' => {
  if (kind === 'brands') return 'brands';
  if (kind === 'health-concerns') return 'health_concerns';
  return 'categories';
};

const ensureHealthConcernMetaColumns = async (): Promise<void> => {
  await AppDataSource.query(`
    ALTER TABLE "health_concerns"
    ADD COLUMN IF NOT EXISTS "meta_title" character varying(255)
  `);
  await AppDataSource.query(`
    ALTER TABLE "health_concerns"
    ADD COLUMN IF NOT EXISTS "meta_description" text
  `);
};

const invalidateListingCaches = async (): Promise<{ connected: boolean; keysDeleted: number }> => {
  const client = new Redis(
    buildRedisClientOptions({
      host: process.env['REDIS_HOST'] || 'localhost',
      port: Number(process.env['REDIS_PORT'] ?? 6379),
      password: process.env['REDIS_PASSWORD'] || undefined,
      username: process.env['REDIS_USERNAME'] || undefined,
      tls: process.env['REDIS_TLS'] === 'true',
      lazyConnect: true,
      enableOfflineQueue: false,
    }),
  );

  try {
    await client.connect();
  } catch {
    return { connected: false, keysDeleted: 0 };
  }

  const patterns = [
    CacheKeys.publicProducts.listPattern(),
    CacheKeys.brands.listPattern(),
    CacheKeys.categories.listPattern(),
    CacheKeys.categories.treePattern(),
    CacheKeys.homepage.brandsWeTrustPattern(),
    CacheKeys.homepage.healthConcernsPattern(),
    CacheKeys.homepage.expertCuratedBundlesPattern(),
    CacheKeys.homepage.sectionsPattern(),
    CacheKeys.homepage.categoryHeaderPattern(),
    CacheKeys.homepage.shopByCategoryPattern(),
  ];

  let keysDeleted = 0;
  try {
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          keysDeleted += await client.del(...keys);
        }
      } while (cursor !== '0');
    }
  } finally {
    await client.quit();
  }

  return { connected: true, keysDeleted };
};

async function run(): Promise<void> {
  process.stdout.write('[listing-meta] starting\n');
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  process.stdout.write(`[listing-meta] file=${filePath}\n`);
  console.log(
    `[listing-meta] apply=${opts.apply} only=${[...opts.only].join(',')}` +
      (opts.sqlOut ? ` sqlOut=${opts.sqlOut}` : '') +
      (opts.limit ? ` limit=${opts.limit}` : ''),
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheetByKind: Record<EntityKind, ExcelJS.Worksheet | undefined> = {
    brands: workbook.getWorksheet('Brands') ?? workbook.worksheets[0],
    'health-concerns':
      workbook.getWorksheet('Health concern') ?? workbook.getWorksheet('Health Concern'),
    categories: workbook.getWorksheet('Categories'),
  };

  if (opts.sqlOut) {
    const rowsByKind: Record<EntityKind, SheetRow[]> = {
      brands: [],
      'health-concerns': [],
      categories: [],
    };
    for (const kind of ALL_KINDS) {
      if (!opts.only.has(kind)) continue;
      const worksheet = sheetByKind[kind];
      if (!worksheet) throw new Error(`Workbook is missing the "${kind}" sheet`);
      let rows = readSheetRows(worksheet, kind);
      if (opts.limit) rows = rows.slice(0, opts.limit);
      rowsByKind[kind] = rows;
      console.log(`[listing-meta] ${kind} sheet rows=${rows.length}`);
    }
    const sqlPath = absolutePath(opts.sqlOut);
    writeSqlFile(sqlPath, rowsByKind);
    console.log(`[listing-meta] wrote SQL ${sqlPath}`);
    return;
  }

  await AppDataSource.initialize();
  try {
    if (opts.only.has('health-concerns')) {
      await ensureHealthConcernMetaColumns();
    }

    const allTargets: UpdateTarget[] = [];
    const allNotFound: Record<EntityKind, string[]> = {
      brands: [],
      'health-concerns': [],
      categories: [],
    };

    for (const kind of ALL_KINDS) {
      if (!opts.only.has(kind)) continue;
      const worksheet = sheetByKind[kind];
      if (!worksheet) {
        throw new Error(`Workbook is missing the "${kind}" sheet`);
      }

      let sheetRows = readSheetRows(worksheet, kind);
      if (opts.limit) sheetRows = sheetRows.slice(0, opts.limit);
      console.log(`[listing-meta] ${kind} sheet rows=${sheetRows.length}`);

      const dbRows = await loadDbRows(tableFor(kind));
      const result =
        kind === 'categories'
          ? matchCategories(sheetRows, dbRows)
          : matchBrandOrConcern(kind, sheetRows, dbRows);

      allTargets.push(...result.targets);
      allNotFound[kind] = result.notFound;
      console.log(
        `[listing-meta] ${kind} matched=${result.targets.length} notFound=${result.notFound.length}`,
      );
      if (result.notFound.length) {
        console.log(`[listing-meta] ${kind} not found (first 20):`, result.notFound.slice(0, 20));
      }
    }

    const pending = allTargets.filter(changed);
    console.log(
      `[listing-meta] total matched=${allTargets.length} unchanged=${allTargets.length - pending.length} toUpdate=${pending.length}`,
    );

    if (!opts.apply) {
      const sample = pending.slice(0, 8).map((target) => ({
        kind: target.kind,
        refId: target.refId,
        slug: target.slug,
        matchedBy: target.matchedBy,
        fromTitle: target.currentTitle,
        toTitle: target.metaTitle,
        toDescription: `${target.metaDescription.slice(0, 80)}${target.metaDescription.length > 80 ? '…' : ''}`,
      }));
      console.log('[listing-meta] dry-run sample:', JSON.stringify(sample, null, 2));
      console.log('[listing-meta] dry-run complete — re-run with --apply to persist');
      return;
    }

    let updated = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const target of pending) {
      try {
        const table = tableFor(target.kind);
        await AppDataSource.query(
          `UPDATE ${table}
           SET meta_title = $1,
               meta_description = $2,
               updated_at = NOW()
           WHERE id = $3 AND deleted_at IS NULL`,
          [target.metaTitle || null, target.metaDescription || null, target.id],
        );
        updated++;
        if (updated % 200 === 0) {
          console.log(`[listing-meta] updated ${updated}/${pending.length}`);
        }
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`${target.kind} ${target.refId} ${msg}`);
        console.error(`[listing-meta] FAIL ${target.kind} ${target.refId}: ${msg}`);
      }
    }

    const cache = await invalidateListingCaches();
    console.log(
      `[listing-meta] done updated=${updated} failed=${failed} cacheKeysDeleted=${cache.keysDeleted} redis=${cache.connected}`,
    );
    if (failures.length) {
      console.log('[listing-meta] failures:', failures.slice(0, 20));
    }
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[listing-meta] failed:', error);
    process.exit(1);
  });
