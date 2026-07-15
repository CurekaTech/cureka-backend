/**
 * Updates existing product slugs by matching products.external_product_id to
 * the ID column in a client XLSX sheet.
 *
 * Dry-run (default):
 *   npm run product-slug:import -- --file="docs/slug sheet.xlsx"
 *
 * Apply:
 *   npm run product-slug:import -- --file="docs/slug sheet.xlsx" --apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { APP_CONSTANTS } from '@packages/common';
import { AppDataSource } from '../data-source';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { loadSlugsByProductId } from '../../../../modules/product/utils/bulk-upload-reference-lookup.util';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/slug sheet.xlsx';
const UPDATED_BY = 'product-slug-import';

interface CliOptions {
  file: string;
  apply: boolean;
  report?: string;
}

type RowStatus =
  | 'pending_update'
  | 'updated'
  | 'unchanged'
  | 'conflict_duplicate_slug'
  | 'conflict_existing_slug'
  | 'invalid_slug';

interface ProductSlugRow {
  productId: string;
  productRefId: string;
  productName: string;
  currentSlug: string;
  newSlug: string;
  status: RowStatus;
  reason: string;
  product: ProductEntity;
}

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { file: DEFAULT_FILE, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(`
Product slug importer

Options:
  --file <path>    XLSX with ID and Slug columns (default: ${DEFAULT_FILE})
  --report <path>  Preview/report XLSX output path
  --apply          Update products (without this flag, dry-run only)
`);
      process.exit(0);
    }
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
    } else if (arg === '--file' && next) {
      options.file = next;
      index += 1;
    } else if (arg.startsWith('--report=')) {
      options.report = arg.slice('--report='.length);
    } else if (arg === '--report' && next) {
      options.report = next;
      index += 1;
    }
  }
  return options;
};

const absolutePath = (path: string): string =>
  isAbsolute(path) ? path : resolve(process.cwd(), path);

const defaultReportPath = (): string =>
  resolve(
    process.cwd(),
    'docs',
    `product-slug-import-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`,
  );

const writeReport = async (
  reportPath: string,
  rows: ProductSlugRow[],
  unmatched: Array<{ productId: string; slug: string }>,
  productsMissingId: ProductEntity[],
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const updatesSheet = workbook.addWorksheet('Product Slug Updates');
  updatesSheet.addRow([
    'Product ID',
    'Product Ref ID',
    'Product Name',
    'Current Slug',
    'New Slug',
    'Status',
    'Reason',
  ]).font = { bold: true };
  for (const row of rows) {
    updatesSheet.addRow([
      row.productId,
      row.productRefId,
      row.productName,
      row.currentSlug,
      row.newSlug,
      row.status,
      row.reason,
    ]);
  }
  updatesSheet.views = [{ state: 'frozen', ySplit: 1 }];
  [16, 18, 42, 50, 50, 28, 55].forEach((width, index) => {
    updatesSheet.getColumn(index + 1).width = width;
  });

  const unmatchedSheet = workbook.addWorksheet('Unmatched Sheet IDs');
  unmatchedSheet.addRow(['Product ID', 'Slug', 'Status']).font = { bold: true };
  for (const row of unmatched) {
    unmatchedSheet.addRow([row.productId, row.slug, 'skipped_no_product']);
  }
  unmatchedSheet.views = [{ state: 'frozen', ySplit: 1 }];
  unmatchedSheet.getColumn(1).width = 16;
  unmatchedSheet.getColumn(2).width = 70;
  unmatchedSheet.getColumn(3).width = 24;

  const missingIdSheet = workbook.addWorksheet('Database Products Missing ID');
  missingIdSheet.addRow(['Product Ref ID', 'Product Name', 'Current Slug', 'Status']).font = {
    bold: true,
  };
  for (const product of productsMissingId) {
    missingIdSheet.addRow([
      product.refId,
      product.name,
      product.slug,
      'skipped_missing_product_id',
    ]);
  }
  missingIdSheet.views = [{ state: 'frozen', ySplit: 1 }];
  [18, 50, 60, 30].forEach((width, index) => {
    missingIdSheet.getColumn(index + 1).width = width;
  });

  await workbook.xlsx.writeFile(reportPath);
};

const run = async (options: CliOptions): Promise<void> => {
  const filePath = absolutePath(options.file);
  const reportPath = absolutePath(options.report ?? defaultReportPath());
  const lookup = await loadSlugsByProductId(filePath);
  if (!lookup.loaded) {
    throw new Error(`Could not read ID and Slug columns from ${filePath}`);
  }

  console.log(`[product-slug-import] File: ${filePath}`);
  console.log(`[product-slug-import] Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[product-slug-import] Lookup rows: ${lookup.byProductId.size}`);

  await AppDataSource.initialize();
  try {
    const productRepo = AppDataSource.getRepository(ProductEntity);
    const allActiveProducts = await productRepo.find();
    const products = allActiveProducts.filter((product) => product.externalProductId?.trim());
    const productsMissingId = allActiveProducts.filter(
      (product) => !product.externalProductId?.trim(),
    );
    const productByExternalId = new Map(
      products.map((product) => [product.externalProductId!.trim().toLowerCase(), product]),
    );
    const ownerBySlug = new Map(allActiveProducts.map((product) => [product.slug, product]));

    const rows: ProductSlugRow[] = [];
    const unmatched: Array<{ productId: string; slug: string }> = [];
    for (const [productId, newSlug] of lookup.byProductId) {
      const product = productByExternalId.get(productId);
      if (!product) {
        unmatched.push({ productId, slug: newSlug });
        continue;
      }
      rows.push({
        productId,
        productRefId: product.refId,
        productName: product.name,
        currentSlug: product.slug,
        newSlug,
        status: product.slug === newSlug ? 'unchanged' : 'pending_update',
        reason: product.slug === newSlug ? 'Database already has this slug.' : '',
        product,
      });
    }

    const desiredRows = rows.filter((row) => row.status === 'pending_update');
    const rowsByDesiredSlug = new Map<string, ProductSlugRow[]>();
    for (const row of desiredRows) {
      const entries = rowsByDesiredSlug.get(row.newSlug) ?? [];
      entries.push(row);
      rowsByDesiredSlug.set(row.newSlug, entries);
    }
    for (const row of desiredRows) {
      if (!row.newSlug || row.newSlug.length > APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH) {
        row.status = 'invalid_slug';
        row.reason = `Slug must contain 1–${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters.`;
        continue;
      }
      if ((rowsByDesiredSlug.get(row.newSlug)?.length ?? 0) > 1) {
        row.status = 'conflict_duplicate_slug';
        row.reason = 'More than one matched product requests this slug.';
        continue;
      }
    }

    let foundConflict: boolean;
    do {
      foundConflict = false;
      const movingProductIds = new Set(
        rows
          .filter((candidate) => candidate.status === 'pending_update')
          .map((candidate) => candidate.product.id),
      );
      for (const row of rows.filter((candidate) => candidate.status === 'pending_update')) {
        const owner = ownerBySlug.get(row.newSlug);
        if (owner && owner.id !== row.product.id && !movingProductIds.has(owner.id)) {
          row.status = 'conflict_existing_slug';
          row.reason = `Slug is already used by product ${owner.refId}.`;
          foundConflict = true;
        }
      }
    } while (foundConflict);

    const updates = rows.filter((row) => row.status === 'pending_update');
    if (options.apply && updates.length) {
      await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(ProductEntity);
        for (const row of updates) {
          await repo.update(
            { id: row.product.id },
            { slug: `slug-import-temp-${row.product.id}`, updatedBy: UPDATED_BY },
          );
        }
        for (const row of updates) {
          await repo.update(
            { id: row.product.id },
            { slug: row.newSlug, updatedBy: UPDATED_BY },
          );
          row.status = 'updated';
          row.reason = 'Slug replaced from Product ID lookup.';
        }
      });
      await invalidateProductCache(
        updates.flatMap((row) => [
          { refId: row.productRefId, slug: row.currentSlug },
          { refId: row.productRefId, slug: row.newSlug },
        ]),
        false,
      );
    }

    await writeReport(reportPath, rows, unmatched, productsMissingId);
    const count = (status: RowStatus): number => rows.filter((row) => row.status === status).length;
    console.log('\n[product-slug-import] Summary');
    console.log(`  Existing products matched : ${rows.length}`);
    console.log(`  ${options.apply ? 'Updated' : 'Would update'}             : ${options.apply ? count('updated') : count('pending_update')}`);
    console.log(`  Unchanged                 : ${count('unchanged')}`);
    console.log(`  Conflicts / invalid       : ${rows.length - count('unchanged') - count('pending_update') - count('updated')}`);
    console.log(`  Sheet IDs without product : ${unmatched.length}`);
    console.log(`  DB products without ID    : ${productsMissingId.length}`);
    console.log(`  Report                    : ${reportPath}`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
};

if (require.main === module) {
  run(parseCli(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
