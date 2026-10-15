/**
 * Fill blank CMS and storefront image alt text from the stored name or title.
 *
 * A null alt is filled. An empty string is decorative and is skipped.
 * Existing text is kept unless --overwrite is passed.
 * Each image on a row is one slot. A failed slot is logged and the run continues.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 * Does not call product:media-alt-text and does not change product_media.
 *
 * Usage:
 *   npm run cms:image-alt-text
 *   npm run cms:image-alt-text -- --module=banners --limit=20
 *   npm run cms:image-alt-text -- --apply --batch=200
 *   npm run cms:image-alt-text -- --apply --after-id=<last-success-id>
 *
 * Do not pass --apply against production.
 * Requires DATABASE_URL. Does not call an image-analysis API.
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import {
  CmsAltBackfillCounts,
  CmsAltBackfillSlot,
  applyCmsAltBackfillBatch,
  fileStorageKey,
} from '../../../../modules/master/utils/image-alt-text.util';

const LOG_PREFIX = '[cms-image-alt-text]';
const DEFAULT_BATCH = 200;

interface CliOptions {
  apply: boolean;
  overwrite: boolean;
  batch: number;
  limit?: number;
  afterId?: string;
  module?: string;
}

interface SlotDef {
  fileColumn: string;
  altColumn: string;
}

interface ColumnModule {
  kind: 'column';
  key: string;
  table: string;
  labelSql: string;
  fromSql: string;
  whereSql: string;
  slots: SlotDef[];
}

interface JsonModule {
  kind: 'json';
  key: string;
}

type CmsModule = ColumnModule | JsonModule;

const columnModule = (
  key: string,
  table: string,
  labelColumn: string,
  slots: SlotDef[],
  extra?: { fromSql?: string; whereSql?: string; labelSql?: string },
): ColumnModule => ({
  kind: 'column',
  key,
  table,
  labelSql: extra?.labelSql ?? `t.${labelColumn}`,
  fromSql: extra?.fromSql ?? `${table} t`,
  whereSql: extra?.whereSql ?? 't.deleted_at IS NULL',
  slots,
});

const imageSlots = (pairs: Array<[string, string]>): SlotDef[] =>
  pairs.map(([fileColumn, altColumn]) => ({ fileColumn, altColumn }));

const MODULES: CmsModule[] = [
  columnModule('categories', 'categories', 'name', imageSlots([
    ['image', 'image_alt_text'],
    ['banner', 'banner_alt_text'],
    ['faq_banner', 'faq_banner_alt_text'],
  ])),
  columnModule('brands', 'brands', 'name', imageSlots([
    ['logo', 'logo_alt_text'],
    ['banner', 'banner_alt_text'],
    ['featured_banner', 'featured_banner_alt_text'],
    ['promotional_banner', 'promotional_banner_alt_text'],
    ['secondary_banner', 'secondary_banner_alt_text'],
    ['offer_banner', 'offer_banner_alt_text'],
    ['faq_banner', 'faq_banner_alt_text'],
  ])),
  columnModule('banners', 'banners', 'title', imageSlots([['image_url', 'image_alt_text']])),
  columnModule('blog-posts', 'blog_posts', 'title', imageSlots([['featured_image', 'featured_image_alt_text']])),
  columnModule('blog-categories', 'blog_categories', 'name', imageSlots([['icon', 'icon_alt_text']])),
  columnModule('support-articles', 'support_articles', 'title', imageSlots([['featured_image', 'featured_image_alt_text']])),
  columnModule('health-concerns', 'health_concerns', 'name', imageSlots([
    ['icon', 'icon_alt_text'],
    ['banner', 'banner_alt_text'],
    ['faq_banner', 'faq_banner_alt_text'],
  ])),
  columnModule('wellness-goals', 'wellness_goals', 'name', imageSlots([
    ['image', 'image_alt_text'],
    ['faq_banner', 'faq_banner_alt_text'],
  ])),
  columnModule('testimonials', 'testimonials', 'name', imageSlots([['image', 'image_alt_text']])),
  columnModule('expert-talk', 'expert_talk_items', 'title', imageSlots([['thumbnail', 'thumbnail_alt_text']])),
  columnModule('manufacturers', 'manufacturers', 'name', imageSlots([['logo', 'logo_alt_text']])),
  columnModule('packers', 'packers', 'name', imageSlots([['logo', 'logo_alt_text']])),
  columnModule('importers', 'importers', 'name', imageSlots([['logo', 'logo_alt_text']])),
  columnModule('products', 'products', 'name', imageSlots([
    ['bundle_icon', 'bundle_icon_alt_text'],
    ['size_chart', 'size_chart_alt_text'],
    ['faq_banner', 'faq_banner_alt_text'],
  ])),
  columnModule(
    'product-variants',
    'product_variants',
    'display_name',
    imageSlots([['size_chart', 'size_chart_alt_text']]),
    {
      fromSql: 'product_variants t INNER JOIN products p ON p.id = t.product_id',
      whereSql: 't.deleted_at IS NULL AND p.deleted_at IS NULL',
      labelSql: `COALESCE(NULLIF(BTRIM(t.display_name), ''), p.name)`,
    },
  ),
  { kind: 'json', key: 'home-sections' },
  { kind: 'json', key: 'brand-highlights' },
  { kind: 'json', key: 'promotional-pages' },
];

const printUsage = (): void => {
  console.log(`
cms:image-alt-text — Fill blank CMS image alt text from stored names and titles

Options:
  --apply              Write alt text (default: dry-run)
  --overwrite          Replace non-null alt text, including decorative empty strings
  --batch <n>          Rows per query (default: ${DEFAULT_BATCH})
  --limit <n>          Stop after scanning this many image slots
  --after-id <uuid>    Resume after this row id inside the selected module
  --module <name>      One of: ${MODULES.map((item) => item.key).join(', ')}
`);
};

const optionValue = (argv: string[], index: number, inline: string | undefined, name: string): string => {
  if (inline !== undefined) return inline;
  const next = argv[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return next;
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { apply: false, overwrite: false, batch: DEFAULT_BATCH };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') {
      opts.apply = true;
      continue;
    }
    if (arg === '--overwrite') {
      opts.overwrite = true;
      continue;
    }

    const equals = arg.indexOf('=');
    const key = equals === -1 ? arg : arg.slice(0, equals);
    const inline = equals === -1 ? undefined : arg.slice(equals + 1);
    if (key === '--batch' || key === '--limit') {
      const raw = optionValue(argv, i, inline, key);
      if (inline === undefined) i += 1;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${key} must be a positive integer`);
      }
      if (key === '--batch') opts.batch = parsed;
      else opts.limit = parsed;
      continue;
    }
    if (key === '--after-id' || key === '--module') {
      const raw = optionValue(argv, i, inline, key).trim();
      if (inline === undefined) i += 1;
      if (!raw) throw new Error(`${key} requires a value`);
      if (key === '--after-id') opts.afterId = raw;
      else opts.module = raw;
    }
  }
  return opts;
};

const addCounts = (total: CmsAltBackfillCounts, batch: CmsAltBackfillCounts): void => {
  total.scanned += batch.scanned;
  total.missing += batch.missing;
  total.eligible += batch.eligible;
  total.updated += batch.updated;
  total.skipped += batch.skipped;
  total.failed += batch.failed;
};

const emptyCounts = (): CmsAltBackfillCounts => ({
  scanned: 0,
  missing: 0,
  eligible: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
});

const quoteIdent = (value: string): string => `"${value.replace(/"/g, '')}"`;

interface SelectedColumnRow {
  id: string;
  label: string | null;
  [column: string]: unknown;
}

const selectColumnRows = async (
  module: ColumnModule,
  afterId: string | undefined,
  take: number,
): Promise<SelectedColumnRow[]> => {
  const columns = module.slots.flatMap((slot) => [
    `t.${quoteIdent(slot.fileColumn)} AS ${quoteIdent(slot.fileColumn)}`,
    `t.${quoteIdent(slot.altColumn)} AS ${quoteIdent(slot.altColumn)}`,
  ]);
  const params: unknown[] = [take];
  let cursor = '';
  if (afterId) {
    params.push(afterId);
    cursor = ` AND t.id > $${params.length}::uuid`;
  }
  return AppDataSource.query(
    `SELECT t.id::text AS id, ${module.labelSql} AS label, ${columns.join(', ')}
     FROM ${module.fromSql}
     WHERE ${module.whereSql}${cursor}
     ORDER BY t.id
     LIMIT $1`,
    params,
  );
};

const columnSlots = (module: ColumnModule, rows: SelectedColumnRow[]): CmsAltBackfillSlot[] => {
  const slots: CmsAltBackfillSlot[] = [];
  for (const row of rows) {
    for (const slot of module.slots) {
      if (!fileStorageKey(row[slot.fileColumn])) continue;
      const alt = row[slot.altColumn];
      slots.push({
        id: `${row.id}|${slot.altColumn}`,
        altText: typeof alt === 'string' ? alt : alt == null ? null : null,
        label: typeof row.label === 'string' ? row.label : null,
      });
    }
  }
  return slots;
};

const persistColumn = async (module: ColumnModule, slotId: string, altText: string): Promise<void> => {
  const [rowId, altColumn] = slotId.split('|');
  const allowed = module.slots.some((slot) => slot.altColumn === altColumn);
  if (!rowId || !altColumn || !allowed) {
    throw new Error(`Unexpected slot ${slotId}`);
  }
  await AppDataSource.query(
    `UPDATE ${quoteIdent(module.table)} SET ${quoteIdent(altColumn)} = $1 WHERE id = $2::uuid`,
    [altText, rowId],
  );
};

interface JsonImageSlot {
  file: unknown;
  altKey: string;
  altText: string | null;
  label: string | null;
}

const jsonImageSlot = (
  file: unknown,
  altText: unknown,
  altKey: string,
  label: string | null,
): JsonImageSlot | null => {
  if (!fileStorageKey(file)) return null;
  return {
    file,
    altKey,
    altText: typeof altText === 'string' ? altText : null,
    label,
  };
};

const runColumnModule = async (
  module: ColumnModule,
  options: CliOptions,
  budget: { left: number },
): Promise<CmsAltBackfillCounts> => {
  const totals = emptyCounts();
  let afterId = options.afterId;
  while (budget.left > 0) {
    const take = Math.min(options.batch, budget.left);
    const rows = await selectColumnRows(module, afterId, take);
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]?.id;
    const slots = columnSlots(module, rows).slice(0, budget.left);
    const counts = await applyCmsAltBackfillBatch(slots, options, (id, altText) =>
      persistColumn(module, id, altText),
    );
    budget.left -= counts.scanned;
    addCounts(totals, counts);
    console.log(`${LOG_PREFIX} ${module.key} last-id=${afterId}`, counts);
    if (rows.length < take) break;
  }
  return totals;
};

const runHomeSections = async (
  options: CliOptions,
  budget: { left: number },
): Promise<CmsAltBackfillCounts> => {
  const totals = emptyCounts();
  let afterId = options.afterId;
  while (budget.left > 0) {
    const take = Math.min(options.batch, budget.left);
    const params: unknown[] = [take];
    let cursor = '';
    if (afterId) {
      params.push(afterId);
      cursor = ` AND id > $${params.length}::uuid`;
    }
    const rows = (await AppDataSource.query(
      `SELECT id::text AS id, title, banners
       FROM home_sections
       WHERE deleted_at IS NULL AND banners IS NOT NULL${cursor}
       ORDER BY id
       LIMIT $1`,
      params,
    )) as Array<{ id: string; title: string | null; banners: Array<Record<string, unknown>> }>;
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]?.id;
    const drafts = new Map(
      rows.map((row) => [row.id, Array.isArray(row.banners) ? row.banners : []]),
    );
    const slots: CmsAltBackfillSlot[] = [];
    for (const row of rows) {
      const banners = drafts.get(row.id) ?? [];
      banners.forEach((banner, index) => {
        const pairs: Array<[string, string]> = [
          ['imageUrl', 'imageAltText'],
          ['mobileImageUrl', 'mobileImageAltText'],
        ];
        for (const [fileKey, altKey] of pairs) {
          const slot = jsonImageSlot(banner[fileKey], banner[altKey], altKey, row.title);
          if (!slot) continue;
          slots.push({
            id: `${row.id}|${index}|${altKey}`,
            altText: slot.altText,
            label: slot.label,
          });
        }
      });
    }
    const counts = await applyCmsAltBackfillBatch(slots.slice(0, budget.left), options, async (id, altText) => {
      const [rowId, indexRaw, altKey] = id.split('|');
      const banners = drafts.get(rowId ?? '');
      const index = Number(indexRaw);
      const banner = banners?.[index];
      if (!banners || !banner || (altKey !== 'imageAltText' && altKey !== 'mobileImageAltText')) {
        throw new Error(`Unexpected home section slot ${id}`);
      }
      banner[altKey] = altText;
      await AppDataSource.query(`UPDATE home_sections SET banners = $1::jsonb WHERE id = $2::uuid`, [
        JSON.stringify(banners),
        rowId,
      ]);
    });
    budget.left -= counts.scanned;
    addCounts(totals, counts);
    console.log(`${LOG_PREFIX} home-sections last-id=${afterId}`, counts);
    if (rows.length < take) break;
  }
  return totals;
};

const runBrandHighlights = async (
  options: CliOptions,
  budget: { left: number },
): Promise<CmsAltBackfillCounts> => {
  const totals = emptyCounts();
  let afterId = options.afterId;
  while (budget.left > 0) {
    const take = Math.min(options.batch, budget.left);
    const params: unknown[] = [take];
    let cursor = '';
    if (afterId) {
      params.push(afterId);
      cursor = ` AND id > $${params.length}::uuid`;
    }
    const rows = (await AppDataSource.query(
      `SELECT id::text AS id, brand_highlights AS highlights
       FROM brands
       WHERE deleted_at IS NULL AND brand_highlights IS NOT NULL${cursor}
       ORDER BY id
       LIMIT $1`,
      params,
    )) as Array<{ id: string; highlights: Array<Record<string, unknown>> }>;
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]?.id;
    const drafts = new Map(
      rows.map((row) => [row.id, Array.isArray(row.highlights) ? row.highlights : []]),
    );
    const slots: CmsAltBackfillSlot[] = [];
    for (const row of rows) {
      const highlights = drafts.get(row.id) ?? [];
      highlights.forEach((highlight, index) => {
        const title = typeof highlight.title === 'string' ? highlight.title : null;
        const slot = jsonImageSlot(highlight.icon, highlight.iconAltText, 'iconAltText', title);
        if (!slot) return;
        slots.push({ id: `${row.id}|${index}|iconAltText`, altText: slot.altText, label: slot.label });
      });
    }
    const counts = await applyCmsAltBackfillBatch(slots.slice(0, budget.left), options, async (id, altText) => {
      const [rowId, indexRaw] = id.split('|');
      const highlights = drafts.get(rowId ?? '');
      const highlight = highlights?.[Number(indexRaw)];
      if (!highlights || !highlight) throw new Error(`Unexpected brand highlight slot ${id}`);
      highlight.iconAltText = altText;
      await AppDataSource.query(
        `UPDATE brands SET brand_highlights = $1::jsonb WHERE id = $2::uuid`,
        [JSON.stringify(highlights), rowId],
      );
    });
    budget.left -= counts.scanned;
    addCounts(totals, counts);
    console.log(`${LOG_PREFIX} brand-highlights last-id=${afterId}`, counts);
    if (rows.length < take) break;
  }
  return totals;
};

const runPromotionalPages = async (
  options: CliOptions,
  budget: { left: number },
): Promise<CmsAltBackfillCounts> => {
  const totals = emptyCounts();
  let afterId = options.afterId;
  while (budget.left > 0) {
    const take = Math.min(options.batch, budget.left);
    const params: unknown[] = [take];
    let cursor = '';
    if (afterId) {
      params.push(afterId);
      cursor = ` AND s.id > $${params.length}::uuid`;
    }
    const rows = (await AppDataSource.query(
      `SELECT s.id::text AS id, p.name AS page_name, s.title AS section_title, s.config
       FROM promotional_page_sections s
       INNER JOIN promotional_pages p ON p.id = s.promotional_page_id
       WHERE p.deleted_at IS NULL${cursor}
       ORDER BY s.id
       LIMIT $1`,
      params,
    )) as Array<{
      id: string;
      page_name: string | null;
      section_title: string | null;
      config: Record<string, unknown> | null;
    }>;
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]?.id;
    const drafts = new Map(rows.map((row) => [row.id, row.config ?? {}]));
    const slots: CmsAltBackfillSlot[] = [];
    for (const row of rows) {
      const label = [row.page_name, row.section_title]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join(' ');
      const config = row.config ?? {};
      const pairs: Array<[string, string]> = [
        ['desktopImage', 'desktopImageAltText'],
        ['mobileImage', 'mobileImageAltText'],
        ['thumbnail', 'thumbnailAltText'],
      ];
      for (const [fileKey, altKey] of pairs) {
        const slot = jsonImageSlot(config[fileKey], config[altKey], altKey, label || null);
        if (!slot) continue;
        slots.push({ id: `${row.id}|${altKey}`, altText: slot.altText, label: slot.label });
      }
    }
    const counts = await applyCmsAltBackfillBatch(slots.slice(0, budget.left), options, async (id, altText) => {
      const [rowId, altKey] = id.split('|');
      const config = drafts.get(rowId ?? '');
      if (
        !config ||
        (altKey !== 'desktopImageAltText' && altKey !== 'mobileImageAltText' && altKey !== 'thumbnailAltText')
      ) {
        throw new Error(`Unexpected promotional slot ${id}`);
      }
      config[altKey] = altText;
      await AppDataSource.query(
        `UPDATE promotional_page_sections SET config = $1::jsonb WHERE id = $2::uuid`,
        [JSON.stringify(config), rowId],
      );
    });
    budget.left -= counts.scanned;
    addCounts(totals, counts);
    console.log(`${LOG_PREFIX} promotional-pages last-id=${afterId}`, counts);
    if (rows.length < take) break;
  }
  return totals;
};

const runModule = async (
  module: CmsModule,
  options: CliOptions,
  budget: { left: number },
): Promise<CmsAltBackfillCounts> => {
  if (module.kind === 'column') return runColumnModule(module, options, budget);
  if (module.key === 'home-sections') return runHomeSections(options, budget);
  if (module.key === 'brand-highlights') return runBrandHighlights(options, budget);
  return runPromotionalPages(options, budget);
};

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  const selected = options.module
    ? MODULES.filter((module) => module.key === options.module)
    : MODULES;
  if (options.module && selected.length === 0) {
    throw new Error(`Unknown --module ${options.module}. Use --help for names.`);
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  await AppDataSource.initialize();
  const totals = emptyCounts();
  const budget = { left: options.limit ?? Number.POSITIVE_INFINITY };

  try {
    console.log(
      `${LOG_PREFIX} mode=${options.apply ? 'apply' : 'dry-run'} overwrite=${options.overwrite} modules=${selected
        .map((module) => module.key)
        .join(',')}`,
    );
    for (const module of selected) {
      if (budget.left <= 0) break;
      const counts = await runModule(module, options, budget);
      addCounts(totals, counts);
    }
    console.log(`${LOG_PREFIX} done`, totals);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${LOG_PREFIX} ${message}`);
  process.exitCode = 1;
});
