/**
 * Imports blog posts from the client BlogDetailsFinal.xlsx worksheet.
 *
 * Expected columns:
 *   BlogID, Title, Content, BlogURL, PublishedDate, LastModified,
 *   SEOTitle, SEODescription, Slug
 *
 * Behaviour:
 *   - Dry-run by default; pass --apply to write
 *   - Existing posts matched by slug are left unchanged
 *   - Duplicate slugs within the sheet collapse to the first row
 *   - Posts are created as published + public when PublishedDate is present
 *   - categoryRefId is required: pass --category-ref-id, or the script
 *     ensures a default "General" category (slug: general)
 *
 * Usage:
 *   npm run blog:import -- --file="docs/BlogDetailsFinal.xlsx"
 *   npm run blog:apply
 *   npm run blog:update
 *   npm run blog:import -- --file="docs/BlogDetailsFinal.xlsx" --update --apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { generateUniqueRefId } from '@packages/common';
import { AppDataSource } from '../data-source';
import { BlogPostEntity } from '../../../../modules/master/entities/blog-post.entity';
import { BlogCategoryEntity } from '../../../../modules/master/entities/blog-category.entity';
import { BlogPostStatus } from '../../../../modules/master/enums/blog-post-status.enum';
import { BlogPostVisibility } from '../../../../modules/master/enums/blog-post-visibility.enum';
import { BlogCategoryStatus } from '../../../../modules/master/enums/blog-category-status.enum';

const DEFAULT_FILE = 'docs/BlogDetailsFinal.xlsx';
const DEFAULT_BATCH_SIZE = 50;
const CREATED_BY = 'blog-import';
const DEFAULT_CATEGORY_NAME = 'General';
const DEFAULT_CATEGORY_SLUG = 'general';

interface CliOptions {
  file: string;
  sheet?: string;
  apply: boolean;
  update: boolean;
  batchSize: number;
  categoryRefId?: string;
  author?: string;
}

type RowStatus =
  | 'pending_create'
  | 'pending_update'
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'invalid'
  | 'duplicate_sheet';

interface BlogSheetRow {
  rowNumber: number;
  blogId: string;
  title: string;
  content: string;
  blogUrl: string;
  publishedAt: Date | null;
  lastModified: Date | null;
  metaTitle: string | null;
  metaDescription: string | null;
  slug: string;
  status: RowStatus;
  reason?: string;
  postRefId?: string;
}

const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? '').join('').trim();
  }
  if ('result' in value && value.result !== undefined && value.result !== null) {
    if (value.result instanceof Date) return value.result.toISOString();
    return String(value.result).trim();
  }
  if ('text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  return String(cell.text ?? '').trim();
};

const cellDate = (cell: ExcelJS.Cell): Date | null => {
  const value = cell.value;
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date → JS Date (Excel epoch 1899-12-30)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'object' && 'result' in value && value.result instanceof Date) {
    return Number.isNaN(value.result.getTime()) ? null : value.result;
  }
  const text = cellText(cell);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeHeader = (value: string): string =>
  value.toLowerCase().replace(/[*_]+/g, ' ').replace(/\s+/g, ' ').trim();

const absolutePath = (path: string): string =>
  isAbsolute(path) ? path : resolve(process.cwd(), path);

const truncate = (value: string | null | undefined, max: number): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
};

const buildExcerpt = (metaDescription: string | null, content: string): string | null => {
  if (metaDescription?.trim()) return truncate(metaDescription, 500);
  const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return truncate(plain, 500);
};

const BLOCK_TAGS =
  'ol|ul|li|h[1-6]|table|thead|tbody|tfoot|tr|td|th|blockquote|div|section|article|figure|figcaption|picture|pre|hr|img|video|iframe|nav|header|footer';

/** Replace 2+ spaces only in text nodes so HTML attributes/tags stay intact. */
const replaceMultiSpacesOutsideTags = (html: string, replacement: string): string => {
  let result = '';
  let index = 0;
  while (index < html.length) {
    if (html[index] === '<') {
      const end = html.indexOf('>', index);
      if (end === -1) {
        result += html.slice(index);
        break;
      }
      result += html.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    let next = index;
    while (next < html.length && html[next] !== '<') next += 1;
    result += html.slice(index, next).replace(/ {2,}/g, replacement);
    index = next;
  }
  return result;
};

/** Repair common WordPress export img attribute damage from the sheet. */
const fixBrokenImgTags = (html: string): string =>
  html
    // class=" src="..."  → src="..."
    .replace(/<img([^>]*?)\sclass="\s+src="/gi, '<img$1 src="')
    // alt=" width=" → alt="" width="
    .replace(/\salt="\s+(width|height|src|class|style)=/gi, ' alt="" $1=')
    // ensure self-closing-ish imgs stay valid-ish for HTML parsers
    .replace(/<img([^>]*?)(?<!\/)\s*>/gi, '<img$1 />');

const stripTags = (value: string): string => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const HEADING_SKIP =
  /^(table of contents|written by|reviewed by|references|share this|related posts|leave a comment)/i;

/** Promote strong/b-only paragraphs to h2/h3 (old site used bold as section titles). */
const promoteStrongParagraphsToHeadings = (html: string): string =>
  html.replace(/<p>\s*<(strong|b)>([\s\S]*?)<\/\1>\s*<\/p>/gi, (full, _tag, inner: string) => {
    const text = stripTags(inner);
    if (!text || text.length > 140 || HEADING_SKIP.test(text)) {
      return full;
    }
    // Numbered sub-sections → h3, main sections → h2
    if (/^\d+[\).:\s]/.test(text) || /^(less[- ]|when |so why |here('|’)s what)/i.test(text)) {
      return `<h3><strong>${inner}</strong></h3>`;
    }
    return `<h2><strong>${inner}</strong></h2>`;
  });

/** Merge consecutive single-item <ul>/<ol> lists (common TOC export quirk). */
const mergeConsecutiveSingleItemLists = (html: string): string => {
  const pattern =
    /<(ul|ol)(\s[^>]*)?>\s*<li(\s[^>]*)?>([\s\S]*?)<\/li>\s*<\/\1>(?:\s*<\1(?:\s[^>]*)?>\s*<li(?:\s[^>]*)?>([\s\S]*?)<\/li>\s*<\/\1>)+/gi;

  return html.replace(pattern, (block) => {
    const typeMatch = block.match(/^<(ul|ol)/i);
    const listType = typeMatch?.[1]?.toLowerCase() === 'ol' ? 'ol' : 'ul';
    const items = [...block.matchAll(/<li(\s[^>]*)?>([\s\S]*?)<\/li>/gi)].map(
      (match) => `<li${match[1] ?? ''}>${match[2]}</li>`,
    );
    if (items.length < 2) return block;
    return `<${listType}>${items.join('')}</${listType}>`;
  });
};

const unwrapBlockTagsFromParagraphs = (html: string): string => {
  let out = html;
  // Repeated passes: nested wraps from space-splitting around lists/headings/images
  for (let pass = 0; pass < 4; pass += 1) {
    const before = out;
    out = out
      .replace(new RegExp(`<p>\\s*(<(?:${BLOCK_TAGS})\\b[^>]*>)`, 'gi'), '$1')
      .replace(new RegExp(`(</(?:${BLOCK_TAGS})>)\\s*</p>`, 'gi'), '$1')
      .replace(new RegExp(`<p>\\s*(</(?:${BLOCK_TAGS})>)`, 'gi'), '$1')
      .replace(new RegExp(`(<(?:${BLOCK_TAGS})\\b[^>]*/?>)\\s*</p>`, 'gi'), '$1')
      .replace(/<p>\s*<\/p>/gi, '');
    if (out === before) break;
  }
  return out;
};

/**
 * Rebuild readable HTML from old-site sheet content:
 * - keep every existing tag (h1–h6, ul/ol/li, img, a, strong, …)
 * - convert multi-space breaks to <p>
 * - promote bold-only section titles to h2/h3
 * - repair broken <img> attributes
 * - merge single-item TOC lists
 */
const normalizeImportedBlogContent = (content: string): string => {
  let html = content.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  if (!html) return html;

  html = fixBrokenImgTags(html);

  const hasParagraphs = (html.match(/<p[\s>]/gi) || []).length >= 2;
  const hasBreaks = (html.match(/<br\s*\/?>/gi) || []).length >= 3;

  if (hasParagraphs || hasBreaks) {
    // Already structured — still repair imgs/lists/headings lightly
    html = replaceMultiSpacesOutsideTags(html, ' ');
    html = mergeConsecutiveSingleItemLists(html);
    html = promoteStrongParagraphsToHeadings(html);
    return html.replace(/\t+/g, '');
  }

  // Plain/WP-fragment HTML: multi-spaces were paragraph separators
  html = replaceMultiSpacesOutsideTags(html, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<\/p>/gi, '');
  html = unwrapBlockTagsFromParagraphs(html);
  html = mergeConsecutiveSingleItemLists(html);
  html = promoteStrongParagraphsToHeadings(html);
  html = html.replace(/\t+/g, '').replace(/<p>\s*<\/p>/gi, '');

  return html;
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_FILE,
    apply: false,
    update: false,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      console.log(`
Blog sheet importer

Options:
  --file <path>                 XLSX file (default: ${DEFAULT_FILE})
  --sheet <name>                Worksheet name (default: first worksheet)
  --category-ref-id <refId>     Existing blog category ref_id (optional)
  --author <name>               Author string stored on each post (optional)
  --batch-size <number>         Creates per transaction (default: ${DEFAULT_BATCH_SIZE})
  --update                      Refresh content/SEO for existing slugs
  --apply                       Write changes (without this flag, dry-run only)

Notes:
  - Without --category-ref-id, a "General" category is ensured (created if missing)
  - Existing posts with the same slug are skipped unless --update is passed
  - Preserves HTML tags; converts multi-space breaks to <p>; promotes bold titles to h2/h3
  - Repairs broken <img> tags from the old WordPress export
`);
      process.exit(0);
    }

    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--update') {
      options.update = true;
    } else if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
    } else if (arg === '--file' && next) {
      options.file = next;
      index += 1;
    } else if (arg.startsWith('--sheet=')) {
      options.sheet = arg.slice('--sheet='.length);
    } else if (arg === '--sheet' && next) {
      options.sheet = next;
      index += 1;
    } else if (arg.startsWith('--category-ref-id=')) {
      options.categoryRefId = arg.slice('--category-ref-id='.length);
    } else if (arg === '--category-ref-id' && next) {
      options.categoryRefId = next;
      index += 1;
    } else if (arg.startsWith('--author=')) {
      options.author = arg.slice('--author='.length);
    } else if (arg === '--author' && next) {
      options.author = next;
      index += 1;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number(arg.slice('--batch-size='.length));
    } else if (arg === '--batch-size' && next) {
      options.batchSize = Number(next);
      index += 1;
    }
  }

  return options;
};

const requireColumn = (headers: Map<string, number>, aliases: string[]): number => {
  for (const alias of aliases) {
    const column = headers.get(alias);
    if (column) return column;
  }
  throw new Error(`Missing required column. Expected one of: ${aliases.join(', ')}`);
};

const readBlogRowsFromSheet = async (
  filePath: string,
  sheetName?: string,
): Promise<BlogSheetRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = sheetName
    ? workbook.getWorksheet(sheetName) ?? workbook.worksheets[0]
    : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`No worksheet found in ${filePath}`);
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header) headers.set(header, columnNumber);
  });

  const col = {
    blogId: headers.get('blogid') ?? headers.get('blog id'),
    title: requireColumn(headers, ['title']),
    content: requireColumn(headers, ['content']),
    blogUrl: headers.get('blogurl') ?? headers.get('blog url'),
    publishedDate: headers.get('publisheddate') ?? headers.get('published date'),
    lastModified: headers.get('lastmodified') ?? headers.get('last modified'),
    seoTitle: headers.get('seotitle') ?? headers.get('seo title'),
    seoDescription: headers.get('seodescription') ?? headers.get('seo description'),
    slug: requireColumn(headers, ['slug']),
  };

  const rows: BlogSheetRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const excelRow = worksheet.getRow(rowNumber);
    const title = cellText(excelRow.getCell(col.title));
    const content = cellText(excelRow.getCell(col.content));
    const slug = cellText(excelRow.getCell(col.slug))
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!title && !content && !slug) continue;

    rows.push({
      rowNumber,
      blogId: col.blogId ? cellText(excelRow.getCell(col.blogId)) : '',
      title,
      content: normalizeImportedBlogContent(content),
      blogUrl: col.blogUrl ? cellText(excelRow.getCell(col.blogUrl)) : '',
      publishedAt: col.publishedDate ? cellDate(excelRow.getCell(col.publishedDate)) : null,
      lastModified: col.lastModified ? cellDate(excelRow.getCell(col.lastModified)) : null,
      metaTitle: col.seoTitle ? truncate(cellText(excelRow.getCell(col.seoTitle)), 255) : null,
      metaDescription: col.seoDescription
        ? truncate(cellText(excelRow.getCell(col.seoDescription)), 500)
        : null,
      slug,
      status: 'pending_create',
    });
  }

  return rows;
};

const ensureCategoryRefId = async (
  categoryRefId: string | undefined,
  apply: boolean,
): Promise<string> => {
  const categoryRepo = AppDataSource.getRepository(BlogCategoryEntity);

  if (categoryRefId) {
    const existing = await categoryRepo.findOne({
      where: { refId: categoryRefId },
      withDeleted: false,
    });
    if (!existing) {
      throw new Error(`Blog category not found for ref_id=${categoryRefId}`);
    }
    console.log(`[blog-import] Using category: ${existing.name} (${existing.refId})`);
    return existing.refId;
  }

  const existingGeneral = await categoryRepo.findOne({
    where: { slug: DEFAULT_CATEGORY_SLUG },
    withDeleted: false,
  });
  if (existingGeneral) {
    console.log(
      `[blog-import] Using existing default category: ${existingGeneral.name} (${existingGeneral.refId})`,
    );
    return existingGeneral.refId;
  }

  if (!apply) {
    console.log(
      `[blog-import] Dry-run: would create default category "${DEFAULT_CATEGORY_NAME}" (slug: ${DEFAULT_CATEGORY_SLUG})`,
    );
    return 'DRY_RUN_CATEGORY';
  }

  const usedRefIds = new Set(
    (
      await categoryRepo
        .createQueryBuilder('category')
        .select(['category.refId'])
        .withDeleted()
        .getMany()
    ).map((category) => category.refId),
  );

  const refId = await generateUniqueRefId(DEFAULT_CATEGORY_NAME, async (value) =>
    usedRefIds.has(value),
  );

  const created = await categoryRepo.save(
    categoryRepo.create({
      name: DEFAULT_CATEGORY_NAME,
      slug: DEFAULT_CATEGORY_SLUG,
      description: 'Default category for imported blog posts',
      icon: null,
      sortOrder: 0,
      status: BlogCategoryStatus.ACTIVE,
      refId,
      createdBy: CREATED_BY,
      updatedBy: CREATED_BY,
    }),
  );

  console.log(`[blog-import] Created default category: ${created.name} (${created.refId})`);
  return created.refId;
};

const run = async (options: CliOptions): Promise<void> => {
  const filePath = absolutePath(options.file);
  console.log(`[blog-import] File: ${filePath}`);
  console.log(
    `[blog-import] Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}${options.update ? ' + UPDATE' : ''}`,
  );

  const sheetRows = await readBlogRowsFromSheet(filePath, options.sheet);
  console.log(`[blog-import] Non-empty sheet rows: ${sheetRows.length}`);

  const bySlug = new Map<string, BlogSheetRow>();
  let invalidCount = 0;
  let duplicateSheetCount = 0;

  for (const row of sheetRows) {
    if (!row.title || !row.content || !row.slug) {
      row.status = 'invalid';
      row.reason = !row.title
        ? 'Missing title'
        : !row.content
          ? 'Missing content'
          : 'Missing slug';
      invalidCount += 1;
      continue;
    }

    if (row.slug.length > 280) {
      row.status = 'invalid';
      row.reason = `Slug exceeds 280 chars (${row.slug.length})`;
      invalidCount += 1;
      continue;
    }

    const existing = bySlug.get(row.slug);
    if (existing) {
      row.status = 'duplicate_sheet';
      row.reason = `Duplicate slug in sheet (first seen on row ${existing.rowNumber})`;
      duplicateSheetCount += 1;
      continue;
    }

    bySlug.set(row.slug, row);
  }

  const candidates = [...bySlug.values()];

  await AppDataSource.initialize();
  try {
    const categoryRefId = await ensureCategoryRefId(options.categoryRefId, options.apply);
    const postRepo = AppDataSource.getRepository(BlogPostEntity);

    const existingPosts = await postRepo
      .createQueryBuilder('post')
      .select(['post.id', 'post.refId', 'post.slug'])
      .withDeleted()
      .getMany();

    const existingBySlug = new Map(existingPosts.map((post) => [post.slug, post]));
    const usedRefIds = new Set(existingPosts.map((post) => post.refId));

    const creates: BlogSheetRow[] = [];
    const updates: BlogSheetRow[] = [];

    for (const candidate of candidates) {
      const existing = existingBySlug.get(candidate.slug);
      if (existing) {
        candidate.postRefId = existing.refId;
        if (options.update) {
          candidate.status = 'pending_update';
          candidate.reason = 'Will refresh content/SEO from sheet.';
          updates.push(candidate);
        } else {
          candidate.status = 'unchanged';
          candidate.reason = 'Blog post with this slug already exists.';
        }
        continue;
      }
      candidate.status = 'pending_create';
      creates.push(candidate);
    }

    let created = 0;
    let updated = 0;

    if (options.apply && (creates.length || updates.length)) {
      if (categoryRefId === 'DRY_RUN_CATEGORY') {
        throw new Error('Internal error: category was not resolved before apply');
      }

      for (let offset = 0; offset < creates.length; offset += options.batchSize) {
        const batch = creates.slice(offset, offset + options.batchSize);
        await AppDataSource.transaction(async (manager) => {
          const repo = manager.getRepository(BlogPostEntity);
          for (const candidate of batch) {
            const refId = await generateUniqueRefId(candidate.title, async (value) =>
              usedRefIds.has(value),
            );
            usedRefIds.add(refId);

            const publishedAt = candidate.publishedAt;
            const createdAt = candidate.publishedAt ?? candidate.lastModified ?? new Date();
            const updatedAt = candidate.lastModified ?? candidate.publishedAt ?? createdAt;

            const saved = await repo.save(
              repo.create({
                title: truncate(candidate.title, 255)!,
                slug: candidate.slug,
                excerpt: buildExcerpt(candidate.metaDescription, candidate.content),
                content: candidate.content,
                faqs: [],
                categoryRefId,
                author: options.author?.trim() || null,
                featuredImage: null,
                videos: [],
                tags: null,
                status: publishedAt ? BlogPostStatus.PUBLISHED : BlogPostStatus.DRAFT,
                visibility: BlogPostVisibility.PUBLIC,
                isFeatured: false,
                isTrending: false,
                metaTitle: candidate.metaTitle,
                metaDescription: candidate.metaDescription,
                metaKeywords: null,
                publishedAt,
                scheduledAt: null,
                views: 0,
                refId,
                createdBy: CREATED_BY,
                updatedBy: CREATED_BY,
                createdAt,
                updatedAt,
              }),
            );

            candidate.status = 'created';
            candidate.postRefId = saved.refId;
            candidate.reason = 'Created from BlogDetailsFinal.xlsx.';
            created += 1;
          }
        });
        console.log(
          `[blog-import] Created ${Math.min(offset + batch.length, creates.length)}/${creates.length}`,
        );
      }

      for (let offset = 0; offset < updates.length; offset += options.batchSize) {
        const batch = updates.slice(offset, offset + options.batchSize);
        await AppDataSource.transaction(async (manager) => {
          const repo = manager.getRepository(BlogPostEntity);
          for (const row of batch) {
            const publishedAt = row.publishedAt;
            const result = await repo.update(
              { slug: row.slug },
              {
                title: truncate(row.title, 255)!,
                excerpt: buildExcerpt(row.metaDescription, row.content),
                content: row.content,
                metaTitle: row.metaTitle,
                metaDescription: row.metaDescription,
                publishedAt,
                status: publishedAt ? BlogPostStatus.PUBLISHED : BlogPostStatus.DRAFT,
                visibility: BlogPostVisibility.PUBLIC,
                updatedBy: CREATED_BY,
                ...(options.author?.trim() ? { author: options.author.trim() } : {}),
              },
            );

            if (!result.affected) {
              row.status = 'unchanged';
              row.reason = 'Update skipped — post not found.';
              continue;
            }

            row.status = 'updated';
            row.reason = 'Updated content/SEO from BlogDetailsFinal.xlsx.';
            updated += 1;
          }
        });
        console.log(
          `[blog-import] Updated ${Math.min(offset + batch.length, updates.length)}/${updates.length}`,
        );
      }
    }

    const unchanged = candidates.filter((item) => item.status === 'unchanged').length;
    const sampleInvalid = sheetRows
      .filter((row) => row.status === 'invalid' || row.status === 'duplicate_sheet')
      .slice(0, 10);

    console.log('\n[blog-import] Summary');
    console.log(`  Sheet rows                   : ${sheetRows.length}`);
    console.log(`  Unique valid slugs           : ${candidates.length}`);
    console.log(`  Already in database (skip)   : ${unchanged}`);
    console.log(
      `  ${options.apply ? 'Created' : 'Would create'}                     : ${options.apply ? created : creates.length}`,
    );
    console.log(
      `  ${options.apply ? 'Updated' : 'Would update'}                     : ${options.apply ? updated : updates.length}`,
    );
    console.log(`  Invalid                      : ${invalidCount}`);
    console.log(`  Duplicate in sheet           : ${duplicateSheetCount}`);
    console.log(`  Category ref_id              : ${categoryRefId}`);

    if (sampleInvalid.length) {
      console.log('\n[blog-import] Sample skipped rows:');
      for (const row of sampleInvalid) {
        console.log(`  row ${row.rowNumber}: ${row.status} — ${row.reason}`);
      }
    }

    if (!options.apply) {
      console.log('\n[blog-import] Dry-run only. Re-run with --apply to write.');
      if (!options.update && updates.length === 0 && creates.length === 0) {
        console.log('[blog-import] Tip: use --update --apply to refresh existing post content.');
      }
    }
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

if (require.main === module) {
  run(parseCli(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
