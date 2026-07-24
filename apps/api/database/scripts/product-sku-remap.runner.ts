/**
 * Remaps product_variants.sku from "Backend SKU" → "New Template SKU"
 * using Sheet1 of the client mismatch workbook.
 *
 * Dry-run (default):
 *   npm run product-sku:remap -- --file="docs/sku-code-mismatch-beta-1.xlsx"
 *
 * Apply:
 *   npm run product-sku:remap -- --file="docs/sku-code-mismatch-beta-1.xlsx" --apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { ILike } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/sku-code-mismatch-beta-1.xlsx';
const SHEET_NAME = 'Sheet1';

interface CliOptions {
  file: string;
  apply: boolean;
  report?: string;
}

type RowStatus =
  | 'pending_update'
  | 'updated'
  | 'unchanged'
  | 'not_found'
  | 'conflict_target_exists'
  | 'conflict_duplicate_backend'
  | 'conflict_duplicate_new'
  | 'invalid';

interface SkuRemapRow {
  sheetRow: number;
  productName: string;
  backendSku: string;
  newSku: string;
  variantId?: string;
  productRefId?: string;
  productNameDb?: string;
  currentSku?: string;
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
Product SKU remapper (Backend SKU → New Template SKU)

Options:
  --file <path>    XLSX with Sheet1 columns: Product Name, New Template SKU, Backend SKU
                   (default: ${DEFAULT_FILE})
  --report <path>  Write preview/result report XLSX
  --apply          Persist SKU updates (without this flag, dry-run only)
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
    `sku-remap-report-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`,
  );

const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'result' in value && value.result != null) {
    return String(value.result).trim();
  }
  return String(value).trim();
};

const normalizeHeader = (value: string): string =>
  value.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();

const readSheetRows = async (
  filePath: string,
): Promise<Array<{ sheetRow: number; productName: string; newSku: string; backendSku: string }>> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet =
    workbook.getWorksheet(SHEET_NAME) ||
    workbook.worksheets.find((sheet) => normalizeHeader(sheet.name) === 'sheet1') ||
    workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`No worksheet found in ${filePath}`);
  }

  const headerMap = new Map<string, number>();
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const header = normalizeHeader(cellText(cell.value));
    if (header) headerMap.set(header, colNumber);
  });

  const nameCol = headerMap.get('product name');
  const newSkuCol = headerMap.get('new template sku');
  const backendSkuCol = headerMap.get('backend sku');
  if (!newSkuCol || !backendSkuCol) {
    throw new Error(
      `Sheet "${worksheet.name}" must include "New Template SKU" and "Backend SKU" columns. Found: ${[
        ...headerMap.keys(),
      ].join(', ')}`,
    );
  }

  const rows: Array<{
    sheetRow: number;
    productName: string;
    newSku: string;
    backendSku: string;
  }> = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const productName = nameCol ? cellText(row.getCell(nameCol).value) : '';
    const newSku = cellText(row.getCell(newSkuCol).value);
    const backendSku = cellText(row.getCell(backendSkuCol).value);
    if (!newSku && !backendSku && !productName) continue;
    rows.push({ sheetRow: rowNumber, productName, newSku, backendSku });
  }

  return rows;
};

const writeReport = async (reportPath: string, rows: SkuRemapRow[]): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('SKU Remap');
  sheet.addRow([
    'Sheet Row',
    'Product Name (Sheet)',
    'Backend SKU',
    'New Template SKU',
    'Variant ID',
    'Product Ref ID',
    'Product Name (DB)',
    'Current SKU',
    'Status',
    'Reason',
  ]).font = { bold: true };

  for (const row of rows) {
    sheet.addRow([
      row.sheetRow,
      row.productName,
      row.backendSku,
      row.newSku,
      row.variantId ?? '',
      row.productRefId ?? '',
      row.productNameDb ?? '',
      row.currentSku ?? '',
      row.status,
      row.reason,
    ]);
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  [12, 40, 18, 18, 38, 16, 40, 18, 24, 55].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  await workbook.xlsx.writeFile(reportPath);
};

const run = async (options: CliOptions): Promise<void> => {
  const filePath = absolutePath(options.file);
  const reportPath = absolutePath(options.report ?? defaultReportPath());
  const sheetRows = await readSheetRows(filePath);

  console.log(`[product-sku-remap] File: ${filePath}`);
  console.log(`[product-sku-remap] Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[product-sku-remap] Sheet rows: ${sheetRows.length}`);

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);
    const productRepo = AppDataSource.getRepository(ProductEntity);

    const backendCount = new Map<string, number>();
    const newCount = new Map<string, number>();
    for (const row of sheetRows) {
      if (row.backendSku) {
        const key = row.backendSku.toLowerCase();
        backendCount.set(key, (backendCount.get(key) ?? 0) + 1);
      }
      if (row.newSku) {
        const key = row.newSku.toLowerCase();
        newCount.set(key, (newCount.get(key) ?? 0) + 1);
      }
    }

    const results: SkuRemapRow[] = [];
    for (const row of sheetRows) {
      const base: SkuRemapRow = {
        sheetRow: row.sheetRow,
        productName: row.productName,
        backendSku: row.backendSku,
        newSku: row.newSku,
        status: 'invalid',
        reason: '',
      };

      if (!row.backendSku || !row.newSku) {
        base.reason = 'Both Backend SKU and New Template SKU are required.';
        results.push(base);
        continue;
      }

      if ((backendCount.get(row.backendSku.toLowerCase()) ?? 0) > 1) {
        base.status = 'conflict_duplicate_backend';
        base.reason = 'Backend SKU is duplicated within the sheet.';
        results.push(base);
        continue;
      }

      if ((newCount.get(row.newSku.toLowerCase()) ?? 0) > 1) {
        base.status = 'conflict_duplicate_new';
        base.reason = 'New Template SKU is duplicated within the sheet.';
        results.push(base);
        continue;
      }

      const variant = await variantRepo.findOne({
        where: { sku: ILike(row.backendSku) },
        relations: { product: true },
      });

      if (!variant) {
        base.status = 'not_found';
        base.reason = `No product_variants row found for Backend SKU "${row.backendSku}".`;
        results.push(base);
        continue;
      }

      base.variantId = variant.id;
      base.currentSku = variant.sku;
      base.productRefId = variant.product?.refId;
      base.productNameDb = variant.product?.name;

      if (variant.sku.toLowerCase() === row.newSku.toLowerCase()) {
        base.status = 'unchanged';
        base.reason = 'Variant already has the New Template SKU.';
        results.push(base);
        continue;
      }

      const conflict = await variantRepo.findOne({
        where: { sku: ILike(row.newSku) },
        relations: { product: true },
      });
      if (conflict && conflict.id !== variant.id) {
        base.status = 'conflict_target_exists';
        base.reason = `New Template SKU "${row.newSku}" already belongs to variant ${conflict.id} (product ${conflict.product?.refId ?? 'unknown'}).`;
        results.push(base);
        continue;
      }

      base.status = 'pending_update';
      base.reason = `Will update "${variant.sku}" → "${row.newSku}".`;
      results.push(base);
    }

    const pending = results.filter((row) => row.status === 'pending_update');
    console.log(`[product-sku-remap] Pending updates: ${pending.length}`);
    console.log(
      `[product-sku-remap] Not found: ${results.filter((row) => row.status === 'not_found').length}`,
    );
    console.log(
      `[product-sku-remap] Conflicts: ${
        results.filter((row) => row.status.startsWith('conflict_')).length
      }`,
    );

    if (options.apply && pending.length) {
      await AppDataSource.transaction(async (manager) => {
        for (const row of pending) {
          await manager.getRepository(ProductVariantEntity).update(
            { id: row.variantId! },
            { sku: row.newSku },
          );
          row.status = 'updated';
          row.reason = `Updated "${row.currentSku}" → "${row.newSku}".`;
        }
      });

      const productRefIds = [
        ...new Set(
          pending
            .map((row) => row.productRefId)
            .filter((refId): refId is string => Boolean(refId)),
        ),
      ];
      if (productRefIds.length) {
        // Touch products so updated_at moves (helps cache/search freshness).
        await productRepo
          .createQueryBuilder()
          .update(ProductEntity)
          .set({ updatedAt: () => 'CURRENT_TIMESTAMP' })
          .where('ref_id IN (:...refIds)', { refIds: productRefIds })
          .execute();
      }

      try {
        const redisResult = await invalidateProductCache();
        console.log(
          `[product-sku-remap] Cache invalidation: connected=${redisResult.connected}, keysDeleted=${redisResult.keysDeleted}`,
        );
      } catch (error) {
        console.warn(
          `[product-sku-remap] Cache invalidation skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else if (!options.apply) {
      console.log('[product-sku-remap] Dry-run only. Re-run with --apply to persist changes.');
    }

    await writeReport(reportPath, results);
    console.log(`[product-sku-remap] Report: ${reportPath}`);

    const summary = results.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log('[product-sku-remap] Summary:', summary);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

run(parseCli(process.argv.slice(2))).catch((error) => {
  console.error('[product-sku-remap] Failed:', error);
  process.exit(1);
});
