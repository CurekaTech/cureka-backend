/**
 * Imports product manufacturer addresses from an XLSX worksheet.
 *
 * Expected columns:
 *   ID | SKU | Name | Manufacture Address
 *
 * Matching priority: ID (external_product_id / refId) -> SKU (variant sku) -> Name.
 * Address is stored on products.manufacturer_address (TEXT — long values supported).
 *
 * Usage:
 *   npm run manufacturer-address:import -- --file="docs/Manufacture details (1).xlsx"
 *   npm run manufacturer-address:import -- --file="docs/Manufacture details (1).xlsx" --apply
 */
import 'reflect-metadata';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';
import {
  ManufacturerSheetRow,
  normalizeText,
  readManufacturerSheetRows,
} from './manufacturer-import.shared';

const DEFAULT_FILE = 'docs/Manufacture details (1).xlsx';
const DEFAULT_BATCH_SIZE = 500;
const UPDATED_BY = 'manufacturer-address-import';

interface CliOptions {
  file: string;
  sheet?: string;
  apply: boolean;
  batchSize: number;
  report?: string;
}

type RowStatus =
  | 'pending_update'
  | 'unchanged'
  | 'invalid'
  | 'not_found'
  | 'ambiguous'
  | 'conflict'
  | 'duplicate_row';

interface ReportRow extends ManufacturerSheetRow {
  status: RowStatus;
  productRefId?: string;
  matchedBy?: 'id' | 'sku' | 'name';
  reason?: string;
}

interface ProductLookup {
  id: string;
  refId: string;
  slug: string;
  name: string;
  externalProductId: string | null;
  manufacturerAddress: string | null;
}

interface ResolvedUpdate {
  product: ProductLookup;
  address: string;
  sourceRows: number[];
}

interface ProductLookups {
  byExternalId: Map<string, ProductLookup[]>;
  byRefId: Map<string, ProductLookup[]>;
  bySku: Map<string, ProductLookup[]>;
  byName: Map<string, ProductLookup[]>;
}

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_FILE,
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      console.log(`
Product manufacturer address XLSX importer

Options:
  --file <path>          XLSX file (default: ${DEFAULT_FILE})
  --sheet <name>         Worksheet name (default: first worksheet)
  --batch-size <number>  Updates per transaction (default: ${DEFAULT_BATCH_SIZE})
  --report <path>        JSON report output path
  --apply                Write changes (without this flag, dry-run only)
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
    } else if (arg.startsWith('--sheet=')) {
      options.sheet = arg.slice('--sheet='.length);
    } else if (arg === '--sheet' && next) {
      options.sheet = next;
      index += 1;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number(arg.slice('--batch-size='.length));
    } else if (arg === '--batch-size' && next) {
      options.batchSize = Number(next);
      index += 1;
    } else if (arg.startsWith('--report=')) {
      options.report = arg.slice('--report='.length);
    } else if (arg === '--report' && next) {
      options.report = next;
      index += 1;
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('--batch-size must be a positive integer.');
  }

  return options;
};

const buildReportPath = (options: CliOptions): string => {
  if (options.report) {
    return isAbsolute(options.report) ? options.report : resolve(process.cwd(), options.report);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(process.cwd(), 'docs', `manufacturer-address-import-${timestamp}.json`);
};

const pushLookup = (map: Map<string, ProductLookup[]>, key: string, product: ProductLookup): void => {
  if (!key) return;
  const matches = map.get(key) ?? [];
  if (!matches.some((item) => item.id === product.id)) {
    matches.push(product);
    map.set(key, matches);
  }
};

const loadLookups = async (): Promise<ProductLookups> => {
  const products = await AppDataSource.getRepository(ProductEntity)
    .createQueryBuilder('product')
    .select([
      'product.id',
      'product.refId',
      'product.slug',
      'product.name',
      'product.externalProductId',
      'product.manufacturerAddress',
    ])
    .where('product.deletedAt IS NULL')
    .getMany();

  const variants = await AppDataSource.getRepository(ProductVariantEntity)
    .createQueryBuilder('variant')
    .innerJoin('variant.product', 'product')
    .select(['variant.sku', 'variant.vendorSku', 'product.id'])
    .where('variant.deletedAt IS NULL')
    .andWhere('product.deletedAt IS NULL')
    .getMany();

  const productById = new Map(products.map((product) => [product.id, product]));
  const byExternalId = new Map<string, ProductLookup[]>();
  const byRefId = new Map<string, ProductLookup[]>();
  const byName = new Map<string, ProductLookup[]>();
  const bySku = new Map<string, ProductLookup[]>();

  for (const product of products) {
    const lookup: ProductLookup = {
      id: product.id,
      refId: product.refId,
      slug: product.slug,
      name: product.name,
      externalProductId: product.externalProductId,
      manufacturerAddress: product.manufacturerAddress,
    };

    if (product.externalProductId) {
      pushLookup(byExternalId, normalizeText(product.externalProductId), lookup);
    }
    pushLookup(byRefId, normalizeText(product.refId), lookup);
    pushLookup(byName, normalizeText(product.name), lookup);
  }

  for (const variant of variants) {
    const product = productById.get(variant.productId);
    if (!product) continue;

    const lookup: ProductLookup = {
      id: product.id,
      refId: product.refId,
      slug: product.slug,
      name: product.name,
      externalProductId: product.externalProductId,
      manufacturerAddress: product.manufacturerAddress,
    };

    pushLookup(bySku, normalizeText(variant.sku), lookup);
    if (variant.vendorSku) {
      pushLookup(bySku, normalizeText(variant.vendorSku), lookup);
    }
  }

  return { byExternalId, byRefId, bySku, byName };
};

const resolveFromMatches = (
  matches: ProductLookup[],
): { product?: ProductLookup; status?: RowStatus; reason?: string } => {
  if (matches.length === 0) {
    return { status: 'not_found' };
  }
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      reason: 'Identifier matches more than one active product.',
    };
  }
  return { product: matches[0] };
};

const resolveProduct = (
  row: ManufacturerSheetRow,
  lookups: ProductLookups,
): { product?: ProductLookup; matchedBy?: 'id' | 'sku' | 'name'; status?: RowStatus; reason?: string } => {
  const address = row.address.trim();
  if (!address) {
    return { status: 'invalid', reason: 'Manufacture Address is empty.' };
  }

  const id = row.id.trim();
  const sku = row.sku.trim();
  const name = row.name.trim();

  if (!id && !sku && !name) {
    return { status: 'invalid', reason: 'ID, SKU, and Name are all empty.' };
  }

  if (id) {
    const byExternal = resolveFromMatches(lookups.byExternalId.get(normalizeText(id)) ?? []);
    if (byExternal.product) {
      return { ...byExternal, matchedBy: 'id' };
    }
    if (byExternal.status === 'ambiguous') {
      return { ...byExternal, matchedBy: 'id' };
    }

    const byRef = resolveFromMatches(lookups.byRefId.get(normalizeText(id)) ?? []);
    if (byRef.product) {
      return { ...byRef, matchedBy: 'id' };
    }
    if (byRef.status === 'ambiguous') {
      return { ...byRef, matchedBy: 'id' };
    }
  }

  if (sku) {
    const bySku = resolveFromMatches(lookups.bySku.get(normalizeText(sku)) ?? []);
    if (bySku.product) {
      return { ...bySku, matchedBy: 'sku' };
    }
    if (bySku.status === 'ambiguous') {
      return { ...bySku, matchedBy: 'sku' };
    }
  }

  if (name) {
    const byName = resolveFromMatches(lookups.byName.get(normalizeText(name)) ?? []);
    if (byName.product) {
      return { ...byName, matchedBy: 'name' };
    }
    if (byName.status === 'ambiguous') {
      return { ...byName, matchedBy: 'name' };
    }
  }

  return { status: 'not_found', reason: 'No active product matched ID, SKU, or Name.' };
};

const writeReport = async (
  reportPath: string,
  options: CliOptions,
  rows: ReportRow[],
  updated: number,
): Promise<void> => {
  const counts = rows.reduce<Record<RowStatus, number>>(
    (result, row) => {
      result[row.status] += 1;
      return result;
    },
    {
      pending_update: 0,
      unchanged: 0,
      invalid: 0,
      not_found: 0,
      ambiguous: 0,
      conflict: 0,
      duplicate_row: 0,
    },
  );

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: options.apply ? 'apply' : 'dry-run',
        sourceFile: options.file,
        targetField: 'products.manufacturer_address',
        summary: { totalRows: rows.length, updated, ...counts },
        rows,
      },
      null,
      2,
    ),
    'utf8',
  );
};

const applyUpdates = async (
  updates: ResolvedUpdate[],
  batchSize: number,
): Promise<number> => {
  let updated = 0;

  for (let offset = 0; offset < updates.length; offset += batchSize) {
    const batch = updates.slice(offset, offset + batchSize);
    await AppDataSource.transaction(async (manager) => {
      for (const item of batch) {
        await manager
          .createQueryBuilder()
          .update(ProductEntity)
          .set({
            manufacturerAddress: item.address,
            updatedBy: UPDATED_BY,
          })
          .where('id = :id', { id: item.product.id })
          .execute();
        updated += 1;
      }
    });
    console.log(
      `[manufacturer-address-import] Updated ${Math.min(offset + batch.length, updates.length)}/${updates.length}`,
    );
  }

  return updated;
};

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  options.file = isAbsolute(options.file) ? options.file : resolve(process.cwd(), options.file);
  const reportPath = buildReportPath(options);

  console.log(`[manufacturer-address-import] File: ${options.file}`);
  console.log(
    `[manufacturer-address-import] Mode: ${options.apply ? 'APPLY' : 'DRY RUN (no database changes)'}`,
  );
  console.log('[manufacturer-address-import] Target: products.manufacturer_address (TEXT)');

  const sheetRows = await readManufacturerSheetRows(options.file, options.sheet);
  console.log(`[manufacturer-address-import] Non-empty sheet rows: ${sheetRows.length}`);

  await AppDataSource.initialize();
  try {
    const lookups = await loadLookups();
    const reportRows: ReportRow[] = [];
    const updatesByProduct = new Map<string, ResolvedUpdate>();
    const conflictingProductIds = new Set<string>();

    for (const row of sheetRows) {
      const resolved = resolveProduct(row, lookups);
      if (!resolved.product) {
        reportRows.push({
          ...row,
          status: resolved.status ?? 'not_found',
          reason: resolved.reason,
        });
        continue;
      }

      const address = row.address.trim();
      if (normalizeText(resolved.product.manufacturerAddress ?? '') === normalizeText(address)) {
        reportRows.push({
          ...row,
          status: 'unchanged',
          productRefId: resolved.product.refId,
          matchedBy: resolved.matchedBy,
        });
        continue;
      }

      const existing = updatesByProduct.get(resolved.product.id);
      if (existing) {
        if (normalizeText(existing.address) !== normalizeText(address)) {
          conflictingProductIds.add(resolved.product.id);
          reportRows.push({
            ...row,
            status: 'conflict',
            productRefId: resolved.product.refId,
            matchedBy: resolved.matchedBy,
            reason: `Another row has a different address for this product (rows ${existing.sourceRows.join(', ')}).`,
          });
        } else {
          existing.sourceRows.push(row.rowNumber);
          reportRows.push({
            ...row,
            status: 'duplicate_row',
            productRefId: resolved.product.refId,
            matchedBy: resolved.matchedBy,
          });
        }
        continue;
      }

      updatesByProduct.set(resolved.product.id, {
        product: resolved.product,
        address,
        sourceRows: [row.rowNumber],
      });
      reportRows.push({
        ...row,
        status: 'pending_update',
        productRefId: resolved.product.refId,
        matchedBy: resolved.matchedBy,
      });
    }

    const productIdByRefId = new Map<string, string>();
    for (const products of [lookups.byExternalId, lookups.byRefId, lookups.bySku, lookups.byName]) {
      for (const matches of products.values()) {
        for (const product of matches) {
          productIdByRefId.set(product.refId, product.id);
        }
      }
    }

    for (const productId of conflictingProductIds) {
      updatesByProduct.delete(productId);
      for (const row of reportRows) {
        if (
          row.productRefId &&
          productIdByRefId.get(row.productRefId) === productId &&
          (row.status === 'pending_update' || row.status === 'duplicate_row')
        ) {
          row.status = 'conflict';
          row.reason ??= 'Conflicting addresses exist for this product in the spreadsheet.';
        }
      }
    }

    const updates = [...updatesByProduct.values()];
    const updated = options.apply ? await applyUpdates(updates, options.batchSize) : 0;

    if (options.apply && updated > 0) {
      const cache = await invalidateProductCache(
        updates.map((item) => ({
          refId: item.product.refId,
          slug: item.product.slug,
        })),
        false,
      );
      console.log(
        cache.connected
          ? `[manufacturer-address-import] Redis cache keys deleted: ${cache.keysDeleted}`
          : '[manufacturer-address-import] Redis unavailable; clear product cache before verification.',
      );
    }

    await writeReport(reportPath, options, reportRows, updated);

    const skipped = reportRows.filter((row) =>
      ['invalid', 'not_found', 'ambiguous', 'conflict'].includes(row.status),
    ).length;

    console.log('\n[manufacturer-address-import] Summary');
    console.log(`  Rows read       : ${sheetRows.length}`);
    console.log(`  Products matched: ${updates.length}`);
    console.log(`  ${options.apply ? 'Updated' : 'Would update'}: ${options.apply ? updated : updates.length}`);
    console.log(`  Skipped         : ${skipped}`);
    console.log(`  Report          : ${reportPath}`);
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error(
    '[manufacturer-address-import] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
