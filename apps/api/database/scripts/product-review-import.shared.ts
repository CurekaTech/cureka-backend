/**
 * Shared product-review Excel import.
 *
 * Changing a SKU changes import_key, because the hash includes the matched SKU.
 * A later SKU edit therefore inserts a new row instead of updating the old one.
 *
 * Rows are inserted as approved. moderated_by is review-import.
 * user_id is left null. Dry-run is the default; writes require --apply.
 * Inserts use ON CONFLICT (import_key) DO NOTHING and count those rows as skipped duplicates.
 *
 * Large sheets are processed in batches:
 *   --batch-size=N   rows prepared/inserted per batch (default 200)
 * SKU lookups are prefetched once per batch (WHERE sku = ANY(...)).
 * This script never invalidates Redis product caches.
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { generateUniqueRefId } from '@packages/common';
import { AppDataSource } from '../data-source';
import { ProductReviewStatus } from '../../../../modules/product/enums/product-review-status.enum';
import {
  assertReviewImportWriteAllowed,
  classifyImportInsert,
  describeDatabaseTarget,
  prepareReviewImportRow,
  type ActiveVariantSkuMatch,
  type ReadyReviewImportRow,
} from '../../../../modules/product/utils/product-review-import.util';

const CREATED_BY = 'review-import';
const DEFAULT_BATCH_SIZE = 200;
const INSERT_CHUNK_SIZE = 50;

export interface ProductReviewImportCli {
  mode: 'test' | 'live';
  file: string;
  apply: boolean;
  confirmLive: boolean;
  batchSize: number;
}

const HEADER_ALIASES: Record<string, string> = {
  'sku code': 'sku',
  'review name': 'name',
  'review age': 'age',
  'review location': 'location',
  'review rating': 'rating',
  'review title': 'title',
  'review text': 'text',
};

type SheetReviewRow = {
  rowNumber: number;
  sku: string;
  name: string;
  age: string;
  location: string;
  rating: string;
  title: string;
  text: string;
};

const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && value && 'result' in value) {
    return cellText({ value: (value as { result: ExcelJS.CellValue }).result } as ExcelJS.Cell);
  }
  return String(value).trim();
};

const headerKey = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

function parseBatchSize(argv: string[]): number {
  const flag = argv.find((arg) => arg.startsWith('--batch-size='));
  if (!flag) return DEFAULT_BATCH_SIZE;
  const value = Number(flag.slice('--batch-size='.length));
  if (!Number.isFinite(value) || value < 1 || value > 5000) {
    throw new Error('--batch-size must be an integer between 1 and 5000');
  }
  return Math.floor(value);
}

export function parseReviewImportArgs(argv: string[], mode: 'test' | 'live', file: string): ProductReviewImportCli {
  return {
    mode,
    file,
    apply: argv.includes('--apply'),
    confirmLive: argv.includes('--confirm-live'),
    batchSize: parseBatchSize(argv),
  };
}

export async function runProductReviewImport(options: ProductReviewImportCli): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is required');
  }

  const target = describeDatabaseTarget(databaseUrl);
  console.log(`Review import database=${target.database} host=${target.host}`);
  console.log(`batchSize=${options.batchSize} insertChunk=${INSERT_CHUNK_SIZE} cacheInvalidation=off`);

  assertReviewImportWriteAllowed({
    mode: options.mode,
    apply: options.apply,
    confirmLive: options.confirmLive,
    databaseName: target.database,
    liveDatabaseName: process.env.REVIEW_IMPORT_LIVE_DATABASE?.trim() || undefined,
  });

  const filePath = isAbsolute(options.file) ? options.file : resolve(process.cwd(), options.file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No worksheet in ${filePath}`);

  const headerRow = sheet.getRow(1);
  const columns = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, index) => {
    const alias = HEADER_ALIASES[headerKey(cellText(cell))];
    if (alias) columns.set(alias, index);
  });
  for (const required of ['sku', 'name', 'rating']) {
    if (!columns.has(required)) {
      throw new Error(`Missing required column for ${required}`);
    }
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const totals = { rows: 0, created: 0, duplicates: 0, skipped: 0, ready: 0, batches: 0 };
  const failures: Array<{ row: number; reason: string }> = [];
  let pending: SheetReviewRow[] = [];

  const flushBatch = async (batch: SheetReviewRow[]): Promise<void> => {
    if (!batch.length) return;
    totals.batches += 1;
    const skuList = [...new Set(batch.map((row) => row.sku.trim()).filter(Boolean))];
    const matchesBySku = await findActiveVariantsBySkus(skuList);
    const ready: ReadyReviewImportRow[] = [];

    for (const sheetRow of batch) {
      totals.rows += 1;
      const prepared = prepareReviewImportRow({
        sku: sheetRow.sku,
        customerName: sheetRow.name,
        age: sheetRow.age,
        location: sheetRow.location,
        rating: sheetRow.rating,
        title: sheetRow.title,
        text: sheetRow.text,
        matches: matchesBySku.get(sheetRow.sku.trim()) ?? [],
      });
      if (prepared.status === 'skipped') {
        totals.skipped += 1;
        failures.push({ row: sheetRow.rowNumber, reason: prepared.reason });
        continue;
      }
      ready.push(prepared.row);
    }

    totals.ready += ready.length;

    if (options.apply && ready.length) {
      for (let index = 0; index < ready.length; index += INSERT_CHUNK_SIZE) {
        const chunk = ready.slice(index, index + INSERT_CHUNK_SIZE);
        const outcome = await insertReviewBatch(chunk);
        totals.created += outcome.created;
        totals.duplicates += outcome.duplicates;
      }
    }

    console.log(
      [
        `batch=${totals.batches}`,
        `rowsSoFar=${totals.rows}`,
        `readySoFar=${totals.ready}`,
        `createdSoFar=${options.apply ? totals.created : 0}`,
        `duplicatesSoFar=${options.apply ? totals.duplicates : 0}`,
        `skippedSoFar=${totals.skipped}`,
      ].join(' '),
    );
  };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const read = (key: string) => {
      const index = columns.get(key);
      return index ? cellText(row.getCell(index)) : '';
    };
    const sku = read('sku');
    const name = read('name');
    if (!sku && !name && !read('rating') && !read('title') && !read('text')) continue;

    pending.push({
      rowNumber,
      sku,
      name,
      age: read('age'),
      location: read('location'),
      rating: read('rating'),
      title: read('title'),
      text: read('text'),
    });

    if (pending.length >= options.batchSize) {
      await flushBatch(pending);
      pending = [];
    }
  }

  if (pending.length) {
    await flushBatch(pending);
    pending = [];
  }

  console.log(
    [
      `mode=${options.mode}`,
      `apply=${options.apply}`,
      `batches=${totals.batches}`,
      `rows=${totals.rows}`,
      `created=${options.apply ? totals.created : 0}`,
      `duplicates=${options.apply ? totals.duplicates : 0}`,
      `skipped=${totals.skipped}`,
      `ready=${totals.ready}`,
      `cacheInvalidation=skipped`,
    ].join(' '),
  );
  console.log('Product Redis cache was not cleared. Reviews appear after cache TTL or a manual cache:invalidate-products if needed.');
  for (const failure of failures) {
    console.log(`skipped row=${failure.row} reason=${failure.reason}`);
  }

  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}

async function findActiveVariantsBySkus(
  skus: string[],
): Promise<Map<string, ActiveVariantSkuMatch[]>> {
  const map = new Map<string, ActiveVariantSkuMatch[]>();
  if (!skus.length) return map;
  const rows = (await AppDataSource.query(
    `
    SELECT v.id, v.sku, v.product_id AS "productId", p.ref_id AS "productRefId"
    FROM product_variants v
    INNER JOIN products p ON p.id = v.product_id
    WHERE v.deleted_at IS NULL
      AND v.status = 'active'
      AND v.sku = ANY($1::text[])
    `,
    [skus],
  )) as ActiveVariantSkuMatch[];
  for (const row of rows) {
    const list = map.get(row.sku) ?? [];
    list.push(row);
    map.set(row.sku, list);
  }
  return map;
}

async function insertReviewBatch(
  rows: ReadyReviewImportRow[],
): Promise<{ created: number; duplicates: number }> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  let created = 0;
  let duplicates = 0;
  try {
    for (const row of rows) {
      const refId = await generateUniqueRefId(row.customerName, async (candidate) => {
        const existing = (await queryRunner.query(
          `SELECT 1 FROM product_reviews WHERE ref_id = $1 LIMIT 1`,
          [candidate],
        )) as unknown[];
        return existing.length > 0;
      });
      const inserted = (await queryRunner.query(
        `
        INSERT INTO product_reviews (
          ref_id, product_id, product_ref_id, variant_id, variant_sku,
          user_id, customer_name, rating, review, review_description,
          customer_age, customer_location, status, moderated_by, moderated_at,
          import_key, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          NULL, $6, $7, $8, $9,
          $10, $11, $12, $13, now(),
          $14, $15, $15
        )
        ON CONFLICT (import_key) DO NOTHING
        RETURNING id
        `,
        [
          refId,
          row.productId,
          row.productRefId,
          row.variantId,
          row.sku,
          row.customerName,
          row.rating,
          row.title,
          row.description,
          row.customerAge,
          row.customerLocation,
          ProductReviewStatus.APPROVED,
          CREATED_BY,
          row.importKey,
          CREATED_BY,
        ],
      )) as Array<{ id: string }>;
      if (classifyImportInsert(inserted[0]?.id) === 'created') created += 1;
      else duplicates += 1;
    }
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
  return { created, duplicates };
}
