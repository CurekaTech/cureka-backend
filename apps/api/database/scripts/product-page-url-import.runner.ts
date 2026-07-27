/**
 * Backfill product_variants.product_page_url from the client ProductUrls sheet.
 * Matches sheet `ID` → variant `external_product_id`.
 * Stores path only: `https://www.cureka.com/shop/.../` → `/shop/.../`
 *
 * Dry-run (default):
 *   npm run product-page-url:import
 *
 * Apply:
 *   npm run product-page-url:import:apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import {
  loadProductPageUrlsByProductId,
  normalizeLookupProductId,
} from '../../../../modules/product/utils/bulk-upload-reference-lookup.util';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/ProductUrls.xlsx';

interface CliOptions {
  file: string;
  apply: boolean;
  report?: string;
}

type RowStatus = 'pending_update' | 'updated' | 'unchanged' | 'not_found' | 'invalid';

interface ProductPageUrlRow {
  sheetProductId: string;
  sheetPageUrl: string;
  variantId?: string;
  sku?: string;
  externalProductId?: string;
  currentProductPageUrl?: string | null;
  status: RowStatus;
  reason: string;
}

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { file: DEFAULT_FILE, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(`
Product page URL importer (sheet ID → product_variants.external_product_id)

Options:
  --file <path>    XLSX with ID + product_page_url (default: ${DEFAULT_FILE})
  --report <path>  Write preview/result report XLSX
  --apply          Persist updates (without this flag, dry-run only)
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
    `product-page-url-import-report-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`,
  );

const writeReport = async (rows: ProductPageUrlRow[], reportPath: string): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');
  sheet.columns = [
    { header: 'Sheet Product ID', key: 'sheetProductId', width: 18 },
    { header: 'Sheet Path', key: 'sheetPageUrl', width: 80 },
    { header: 'Variant ID', key: 'variantId', width: 38 },
    { header: 'SKU', key: 'sku', width: 24 },
    { header: 'External Product ID', key: 'externalProductId', width: 20 },
    { header: 'Current product_page_url', key: 'currentProductPageUrl', width: 80 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Reason', key: 'reason', width: 50 },
  ];
  for (const row of rows) {
    sheet.addRow({
      sheetProductId: row.sheetProductId,
      sheetPageUrl: row.sheetPageUrl,
      variantId: row.variantId ?? '',
      sku: row.sku ?? '',
      externalProductId: row.externalProductId ?? '',
      currentProductPageUrl: row.currentProductPageUrl ?? '',
      status: row.status,
      reason: row.reason,
    });
  }
  await workbook.xlsx.writeFile(reportPath);
};

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const filePath = absolutePath(options.file);
  const reportPath = absolutePath(options.report ?? defaultReportPath());

  const lookup = await loadProductPageUrlsByProductId(filePath);
  if (!lookup.loaded || lookup.byProductId.size === 0) {
    throw new Error(
      `Could not load ProductUrls sheet from ${filePath}. Expected columns: ID, product_page_url`,
    );
  }

  console.log(
    `Loaded ${lookup.byProductId.size} product page URL rows from ${lookup.path} (mode=${options.apply ? 'APPLY' : 'DRY-RUN'})`,
  );

  await AppDataSource.initialize();
  const variantRepo = AppDataSource.getRepository(ProductVariantEntity);
  const rows: ProductPageUrlRow[] = [];
  let updated = 0;
  let unchanged = 0;
  let notFound = 0;

  try {
    const variants = await variantRepo.find({
      where: { deletedAt: IsNull() },
      relations: { product: true },
    });

    const variantsByExternalId = new Map<string, ProductVariantEntity[]>();
    for (const variant of variants) {
      const key = normalizeLookupProductId(variant.externalProductId);
      if (!key) continue;
      const list = variantsByExternalId.get(key) ?? [];
      list.push(variant);
      variantsByExternalId.set(key, list);
    }

    const cacheTargets = new Map<string, { refId: string; slug?: string | null }>();

    for (const [sheetProductId, pagePath] of lookup.byProductId.entries()) {
      if (!pagePath) {
        rows.push({
          sheetProductId,
          sheetPageUrl: pagePath,
          status: 'invalid',
          reason: 'Empty product_page_url after normalization',
        });
        continue;
      }

      const matches = variantsByExternalId.get(sheetProductId) ?? [];
      if (!matches.length) {
        notFound += 1;
        rows.push({
          sheetProductId,
          sheetPageUrl: pagePath,
          status: 'not_found',
          reason: 'No product_variant with matching external_product_id',
        });
        continue;
      }

      for (const variant of matches) {
        if ((variant.productPageUrl ?? null) === pagePath) {
          unchanged += 1;
          rows.push({
            sheetProductId,
            sheetPageUrl: pagePath,
            variantId: variant.id,
            sku: variant.sku,
            externalProductId: variant.externalProductId ?? undefined,
            currentProductPageUrl: variant.productPageUrl,
            status: 'unchanged',
            reason: 'Already set to sheet path',
          });
          continue;
        }

        if (options.apply) {
          await variantRepo.update({ id: variant.id }, { productPageUrl: pagePath });
          const productRefId = variant.product?.refId;
          if (productRefId) {
            cacheTargets.set(productRefId, {
              refId: productRefId,
              slug: variant.product?.slug ?? null,
            });
          }
          updated += 1;
          rows.push({
            sheetProductId,
            sheetPageUrl: pagePath,
            variantId: variant.id,
            sku: variant.sku,
            externalProductId: variant.externalProductId ?? undefined,
            currentProductPageUrl: variant.productPageUrl,
            status: 'updated',
            reason: 'Updated product_page_url',
          });
        } else {
          updated += 1;
          rows.push({
            sheetProductId,
            sheetPageUrl: pagePath,
            variantId: variant.id,
            sku: variant.sku,
            externalProductId: variant.externalProductId ?? undefined,
            currentProductPageUrl: variant.productPageUrl,
            status: 'pending_update',
            reason: 'Would update product_page_url',
          });
        }
      }
    }

    if (options.apply && cacheTargets.size > 0) {
      await invalidateProductCache(Array.from(cacheTargets.values()), false);
    }

    await writeReport(rows, reportPath);
  } finally {
    await AppDataSource.destroy();
  }

  console.log('\n=== Product page URL import ===');
  console.log(`Sheet rows:     ${lookup.byProductId.size}`);
  console.log(`${options.apply ? 'Updated' : 'Would update'}: ${updated}`);
  console.log(`Unchanged:      ${unchanged}`);
  console.log(`Not found:      ${notFound}`);
  console.log(`Report:         ${reportPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
