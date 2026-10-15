/**
 * Fill blank product_media.alt_text from stored product, brand, variant, and pack names.
 *
 * Selects image and common rows only. Video and size-chart rows are left alone.
 * A null alt_text is filled. An empty string is decorative and is skipped.
 * Existing text is kept unless --overwrite is passed.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:media-alt-text
 *   npm run product:media-alt-text -- --limit=20
 *   npm run product:media-alt-text -- --apply --batch=200
 *   npm run product:media-alt-text -- --apply --after-id=<last-success-id>
 *
 * Requires DATABASE_URL. Does not call an image-analysis API.
 * On apply, product response caches are invalidated. If Redis is down, rerun:
 *   npm run cache:invalidate-products
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { invalidateProductCache } from './product-cleanup.redis';
import {
  AltTextBackfillCounts,
  AltTextBackfillSourceRow,
  applyAltTextBackfillBatch,
} from '../../../../modules/product/utils/product-media-alt-text.util';

const LOG_PREFIX = '[media-alt-text]';
const DEFAULT_BATCH = 200;

interface CliOptions {
  apply: boolean;
  overwrite: boolean;
  batch: number;
  limit?: number;
  afterId?: string;
}

interface SelectedRow extends AltTextBackfillSourceRow {
  productRefId: string;
}

const printUsage = (): void => {
  console.log(`
product:media-alt-text — Fill blank product image alt text from stored names

Options:
  --apply              Write alt_text (default: dry-run)
  --overwrite          Replace non-null alt text, including decorative empty strings
  --batch <n>          Rows per query (default: ${DEFAULT_BATCH})
  --limit <n>          Stop after scanning this many rows
  --after-id <uuid>    Resume after this product_media id
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
    if (key === '--after-id') {
      const raw = optionValue(argv, i, inline, key).trim();
      if (inline === undefined) i += 1;
      if (!raw) throw new Error('--after-id requires a product_media id');
      opts.afterId = raw;
    }
  }
  return opts;
};

const addCounts = (total: AltTextBackfillCounts, batch: AltTextBackfillCounts): void => {
  total.scanned += batch.scanned;
  total.missing += batch.missing;
  total.eligible += batch.eligible;
  total.updated += batch.updated;
  total.skipped += batch.skipped;
  total.failed += batch.failed;
};

const selectRows = async (
  afterId: string | undefined,
  take: number,
  overwrite: boolean,
): Promise<SelectedRow[]> => {
  const rows = await AppDataSource.query(
    `
    SELECT
      m.id,
      m.alt_text AS "altText",
      p.name AS "productName",
      p.ref_id AS "productRefId",
      b.name AS "brandName",
      v.display_name AS "variantDisplayName",
      pack.value AS "packLabel"
    FROM product_media m
    INNER JOIN products p ON p.id = m.product_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_variants v ON v.id = m.variant_id
    LEFT JOIN LATERAL (
      SELECT av.value
      FROM variant_attribute_values av
      INNER JOIN attributes a ON a.id = av.attribute_id
      WHERE av.variant_id = m.variant_id
        AND (
          a.name ILIKE '%pack%'
          OR a.name ILIKE '%size%'
          OR a.name ILIKE '%volume%'
        )
      ORDER BY
        CASE
          WHEN a.name ILIKE '%pack%' THEN 0
          WHEN a.name ILIKE '%size%' THEN 1
          ELSE 2
        END,
        a.name
      LIMIT 1
    ) pack ON TRUE
    WHERE m.type IN ('image', 'common')
      AND ($1::boolean OR m.alt_text IS NULL)
      AND ($2::uuid IS NULL OR m.id > $2::uuid)
    ORDER BY m.id
    LIMIT $3
    `,
    [overwrite, afterId ?? null, take],
  );
  return rows as SelectedRow[];
};

const logCounts = (label: string, counts: AltTextBackfillCounts): void => {
  console.log(`${LOG_PREFIX} --- ${label} ---`);
  console.log(`  scanned:  ${counts.scanned}`);
  console.log(`  missing:  ${counts.missing}`);
  console.log(`  eligible: ${counts.eligible}`);
  console.log(`  updated:  ${counts.updated}`);
  console.log(`  skipped:  ${counts.skipped}`);
  console.log(`  failed:   ${counts.failed}`);
};

const run = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  console.log(
    `${LOG_PREFIX} ${options.apply ? 'APPLY' : 'DRY RUN'} batch=${options.batch}` +
      `${options.limit ? ` limit=${options.limit}` : ''}` +
      `${options.afterId ? ` afterId=${options.afterId}` : ''}` +
      `${options.overwrite ? ' overwrite' : ''}`,
  );

  const totals: AltTextBackfillCounts = {
    scanned: 0,
    missing: 0,
    eligible: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };
  const touchedRefIds = new Set<string>();
  let afterId = options.afterId;
  let remaining = options.limit;

  await AppDataSource.initialize();
  try {
    while (remaining === undefined || remaining > 0) {
      const take = remaining === undefined ? options.batch : Math.min(options.batch, remaining);
      const rows = await selectRows(afterId, take, options.overwrite);
      if (!rows.length) break;

      const batch = await applyAltTextBackfillBatch(rows, options, async (id, altText) => {
        try {
          const updated = await AppDataSource.query(
            `
            UPDATE product_media
            SET alt_text = $1, updated_at = NOW()
            WHERE id = $2
              AND ($3::boolean OR alt_text IS NULL)
            RETURNING id
            `,
            [altText, id, options.overwrite],
          );
          if (!Array.isArray(updated) || updated.length === 0) {
            throw new Error(`alt_text was not updated for ${id}`);
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} row failed id=${id}`, error);
          throw error;
        }
      });
      addCounts(totals, batch);

      if (options.apply) {
        for (const row of rows) {
          if (row.productRefId) touchedRefIds.add(row.productRefId);
        }
      }

      afterId = rows[rows.length - 1]?.id;
      console.log(`${LOG_PREFIX} last id ${afterId}`);
      if (remaining !== undefined) remaining -= rows.length;
      if (rows.length < take) break;
    }

    logCounts(options.apply ? 'apply complete' : 'dry-run complete', totals);

    if (options.apply && touchedRefIds.size) {
      try {
        const cache = await invalidateProductCache(
          [...touchedRefIds].map((refId) => ({ refId })),
          false,
        );
        console.log(
          `${LOG_PREFIX} cache keys deleted: ${cache.keysDeleted} (redis ${cache.connected ? 'connected' : 'unavailable'})`,
        );
        if (!cache.connected) {
          console.error(`${LOG_PREFIX} recover with: npm run cache:invalidate-products`);
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} cache invalidation failed`, error);
        console.error(`${LOG_PREFIX} recover with: npm run cache:invalidate-products`);
      }
    }

    if (totals.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

run()
  .then(() => {
    if (process.exitCode && process.exitCode !== 0) {
      process.exit(process.exitCode);
    }
  })
  .catch((error) => {
    console.error(`${LOG_PREFIX} failed:`, error);
    process.exit(1);
  });
