/**
 * Apply estimated delivery windows + brand OOS from ESTIMATE-DELIVERY.xlsx.
 *
 * Sheet priority for delivery (later wins):
 *   BRAND → 3-5 days → 5-7Days → 7-9 days → 10-15 DAYS (DAYS column)
 *
 * OS tab independently sets outOfStock = true for all variants of matched brands.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:estimate-delivery
 *   npm run product:estimate-delivery -- --file="docs/Master-Data-Sheets/ESTIMATE-DELIVERY.xlsx"
 *   npm run product:estimate-delivery -- --limit=50
 *   npm run product:estimate-delivery -- --apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { BrandEntity } from '../../../../modules/master/entities/brand.entity';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/ESTIMATE-DELIVERY.xlsx';

const SHEET_BRAND = 'BRAND';
const SHEET_3_5 = '3-5 days';
const SHEET_5_7 = '5-7Days';
const SHEET_7_9 = '7-9 days';
const SHEET_10_15 = '10-15 DAYS';
const SHEET_OS = 'OS';

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
}

interface DeliveryTarget {
  variantId: string;
  productId: string;
  sku: string;
  brandName?: string;
  from: string;
  estimatedDeliveryTime: string;
  previous: string | null;
}

interface OosTarget {
  variantId: string;
  productId: string;
  sku: string;
  brandName: string;
  alreadyOos: boolean;
}

const absolutePath = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.cwd(), p);

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim();
  }
  return String(v).trim();
};

/** Strip leading tabs/whitespace for brand matching. */
const normalizeBrandKey = (name: string): string =>
  name.replace(/^[\s\t]+/, '').trim().toLowerCase();

/**
 * Normalize DAYS / sheet labels to canonical delivery strings.
 * Returns null when the value is unparseable (conflict — skip + log).
 */
const normalizeDeliveryWindow = (raw: string): string | null => {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  // Already ends with Days — normalize casing/spacing only when pattern is clean
  const alreadyDays = lower.match(/^(\d+)\s*[-–—to]+\s*(\d+)\s*days?$/i);
  if (alreadyDays) {
    return `${alreadyDays[1]}-${alreadyDays[2]} Days`;
  }

  // Bare ranges: "3 TO 5", "3-5", "7 – 9"
  const bare = lower.match(/^(\d+)\s*(?:to|[-–—])\s*(\d+)$/i);
  if (bare) {
    return `${bare[1]}-${bare[2]} Days`;
  }

  return null;
};

const printUsage = (): void => {
  console.log(`
product:estimate-delivery — Apply estimated delivery + brand OOS from Excel

Options:
  --file <path>     XLSX file  (default: ${DEFAULT_FILE})
  --apply           Persist changes to DB (default: dry-run)
  --limit <n>       Cap delivery + OOS updates for smoke tests
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
      continue;
    }
  }
  return opts;
};

const findHeaderCols = (
  worksheet: ExcelJS.Worksheet,
  names: string[],
): Record<string, number> => {
  const wanted = new Map(names.map((n) => [n.toLowerCase(), n]));
  const found: Record<string, number> = {};
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase();
    const key = wanted.get(header);
    if (key) found[key] = colNumber;
  });
  return found;
};

const readSkuSheet = (
  worksheet: ExcelJS.Worksheet,
): { skus: string[]; duplicates: string[] } => {
  const cols = findHeaderCols(worksheet, ['SKU']);
  if (!cols.SKU) {
    throw new Error(`Sheet "${worksheet.name}" missing SKU column`);
  }
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  const skus: string[] = [];

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const sku = normalizeText(worksheet.getRow(r).getCell(cols.SKU));
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(sku);
    }
    seen.set(key, sku);
  }
  for (const sku of seen.values()) skus.push(sku);
  return { skus, duplicates };
};

const readSkuDaysSheet = (
  worksheet: ExcelJS.Worksheet,
): {
  rows: Array<{ sku: string; daysRaw: string }>;
  duplicates: string[];
  conflicts: Array<{ sku: string; daysRaw: string }>;
} => {
  const cols = findHeaderCols(worksheet, ['SKU', 'DAYS']);
  if (!cols.SKU) throw new Error(`Sheet "${worksheet.name}" missing SKU column`);
  if (!cols.DAYS) throw new Error(`Sheet "${worksheet.name}" missing DAYS column`);

  const lastBySku = new Map<string, { sku: string; daysRaw: string }>();
  const duplicates: string[] = [];
  const conflicts: Array<{ sku: string; daysRaw: string }> = [];

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const sku = normalizeText(row.getCell(cols.SKU));
    if (!sku) continue;
    const daysRaw = normalizeText(row.getCell(cols.DAYS));
    const key = sku.toLowerCase();
    if (lastBySku.has(key)) duplicates.push(sku);
    lastBySku.set(key, { sku, daysRaw });
  }

  const rows: Array<{ sku: string; daysRaw: string }> = [];
  for (const entry of lastBySku.values()) {
    if (!normalizeDeliveryWindow(entry.daysRaw)) {
      conflicts.push(entry);
      continue;
    }
    rows.push(entry);
  }
  return { rows, duplicates, conflicts };
};

const readBrandSheet = (
  worksheet: ExcelJS.Worksheet,
): {
  rows: Array<{ brandName: string; daysRaw: string; normalized: string }>;
  conflicts: Array<{ brandName: string; daysRaw: string }>;
} => {
  const cols = findHeaderCols(worksheet, ['BRAND NAME', 'DAYS']);
  if (!cols['BRAND NAME']) throw new Error(`Sheet "${worksheet.name}" missing BRAND NAME column`);
  if (!cols.DAYS) throw new Error(`Sheet "${worksheet.name}" missing DAYS column`);

  const rows: Array<{ brandName: string; daysRaw: string; normalized: string }> = [];
  const conflicts: Array<{ brandName: string; daysRaw: string }> = [];

  // Cap scan: brand sheet may report Excel max rows
  const maxRow = Math.min(worksheet.rowCount, 50_000);
  for (let r = 2; r <= maxRow; r++) {
    const row = worksheet.getRow(r);
    const brandName = normalizeText(row.getCell(cols['BRAND NAME']));
    if (!brandName) continue;
    const daysRaw = normalizeText(row.getCell(cols.DAYS));
    const normalized = normalizeDeliveryWindow(daysRaw);
    if (!normalized) {
      conflicts.push({ brandName, daysRaw });
      continue;
    }
    rows.push({ brandName, daysRaw, normalized });
  }
  return { rows, conflicts };
};

const readOsSheet = (worksheet: ExcelJS.Worksheet): string[] => {
  const cols = findHeaderCols(worksheet, ['BRAND NAME']);
  if (!cols['BRAND NAME']) throw new Error(`Sheet "${worksheet.name}" missing BRAND NAME column`);
  const brands: string[] = [];
  const maxRow = Math.min(worksheet.rowCount, 50_000);
  for (let r = 2; r <= maxRow; r++) {
    const brandName = normalizeText(worksheet.getRow(r).getCell(cols['BRAND NAME']));
    if (!brandName) continue;
    brands.push(brandName);
  }
  return brands;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`[estimate-delivery] file=${filePath}`);
  console.log(
    `[estimate-delivery] apply=${opts.apply}${opts.limit ? ` limit=${opts.limit}` : ''}`,
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const requireSheet = (name: string): ExcelJS.Worksheet => {
    const ws = workbook.getWorksheet(name);
    if (!ws) throw new Error(`Missing worksheet "${name}"`);
    return ws;
  };

  const brandSheet = readBrandSheet(requireSheet(SHEET_BRAND));
  const sku35 = readSkuSheet(requireSheet(SHEET_3_5));
  const sku57 = readSkuSheet(requireSheet(SHEET_5_7));
  const sku79 = readSkuSheet(requireSheet(SHEET_7_9));
  const sku1015 = readSkuDaysSheet(requireSheet(SHEET_10_15));
  const osBrands = readOsSheet(requireSheet(SHEET_OS));

  console.log(
    `[estimate-delivery] sheets brand=${brandSheet.rows.length} brandConflicts=${brandSheet.conflicts.length} ` +
      `3-5=${sku35.skus.length} (dups=${sku35.duplicates.length}) ` +
      `5-7=${sku57.skus.length} (dups=${sku57.duplicates.length}) ` +
      `7-9=${sku79.skus.length} (dups=${sku79.duplicates.length}) ` +
      `10-15=${sku1015.rows.length} (dups=${sku1015.duplicates.length} conflicts=${sku1015.conflicts.length}) ` +
      `OS brands=${osBrands.length}`,
  );

  if (brandSheet.conflicts.length) {
    console.log(
      `[estimate-delivery] brand DAYS conflicts (first 20):`,
      brandSheet.conflicts.slice(0, 20),
    );
  }
  if (sku1015.conflicts.length) {
    console.log(`[estimate-delivery] 10-15 DAYS conflicts:`, sku1015.conflicts);
  }
  for (const [label, dups] of [
    ['3-5', sku35.duplicates],
    ['5-7', sku57.duplicates],
    ['7-9', sku79.duplicates],
    ['10-15', sku1015.duplicates],
  ] as const) {
    if (dups.length) {
      console.log(
        `[estimate-delivery] duplicate SKUs in ${label} (count=${dups.length}, first 15):`,
        dups.slice(0, 15),
      );
    }
  }

  await AppDataSource.initialize();
  try {
    const brandRepo = AppDataSource.getRepository(BrandEntity);
    const productRepo = AppDataSource.getRepository(ProductEntity);
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);

    const allBrands = await brandRepo
      .createQueryBuilder('b')
      .select(['b.id', 'b.name'])
      .where('b.deleted_at IS NULL')
      .getMany();
    const brandByKey = new Map<string, BrandEntity>();
    for (const b of allBrands) {
      brandByKey.set(normalizeBrandKey(b.name), b);
    }

    type VariantRow = {
      variant: ProductVariantEntity;
      brandId: string | null;
    };

    const rawRows = await AppDataSource.query<
      Array<{
        id: string;
        product_id: string;
        sku: string;
        out_of_stock: boolean;
        estimated_delivery_time: string | null;
        brand_id: string | null;
      }>
    >(`
      SELECT v.id, v.product_id, v.sku, v.out_of_stock, v.estimated_delivery_time, p.brand_id
      FROM product_variants v
      INNER JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
      WHERE v.deleted_at IS NULL
    `);

    const variantRows: VariantRow[] = rawRows.map((r) => ({
      variant: {
        id: r.id,
        productId: r.product_id,
        sku: r.sku,
        outOfStock: r.out_of_stock,
        estimatedDeliveryTime: r.estimated_delivery_time,
      } as ProductVariantEntity,
      brandId: r.brand_id,
    }));

    const variantsBySku = new Map<string, VariantRow>();
    const variantsByBrandId = new Map<string, VariantRow[]>();
    for (const row of variantRows) {
      variantsBySku.set(row.variant.sku.trim().toLowerCase(), row);
      if (row.brandId) {
        const list = variantsByBrandId.get(row.brandId) ?? [];
        list.push(row);
        variantsByBrandId.set(row.brandId, list);
      }
    }

    /** variantId → final delivery target (later sheets overwrite). */
    const deliveryMap = new Map<string, DeliveryTarget>();
    const unmatchedSkus: Array<{ sheet: string; sku: string }> = [];
    const unmatchedBrands: string[] = [];
    let brandsMatched = 0;

    const applySkuDelivery = (
      sheet: string,
      sku: string,
      estimatedDeliveryTime: string,
    ): void => {
      const match = variantsBySku.get(sku.trim().toLowerCase());
      if (!match) {
        unmatchedSkus.push({ sheet, sku });
        return;
      }
      deliveryMap.set(match.variant.id, {
        variantId: match.variant.id,
        productId: match.variant.productId,
        sku: match.variant.sku,
        from: sheet,
        estimatedDeliveryTime,
        previous: match.variant.estimatedDeliveryTime ?? null,
      });
    };

    // 1. BRAND (lowest priority)
    for (const row of brandSheet.rows) {
      const brand = brandByKey.get(normalizeBrandKey(row.brandName));
      if (!brand) {
        unmatchedBrands.push(row.brandName);
        continue;
      }
      brandsMatched += 1;
      const variants = variantsByBrandId.get(brand.id) ?? [];
      for (const match of variants) {
        deliveryMap.set(match.variant.id, {
          variantId: match.variant.id,
          productId: match.variant.productId,
          sku: match.variant.sku,
          brandName: brand.name,
          from: SHEET_BRAND,
          estimatedDeliveryTime: row.normalized,
          previous: match.variant.estimatedDeliveryTime ?? null,
        });
      }
    }

    // 2–4. SKU sheets by priority
    for (const sku of sku35.skus) applySkuDelivery(SHEET_3_5, sku, '3-5 Days');
    for (const sku of sku57.skus) applySkuDelivery(SHEET_5_7, sku, '5-7 Days');
    for (const sku of sku79.skus) applySkuDelivery(SHEET_7_9, sku, '7-9 Days');

    // 5. 10-15 DAYS — use DAYS column as written (normalized)
    for (const row of sku1015.rows) {
      const normalized = normalizeDeliveryWindow(row.daysRaw);
      if (!normalized) continue;
      applySkuDelivery(SHEET_10_15, row.sku, normalized);
    }

    // 6. OS — brand OOS (independent)
    const oosTargets: OosTarget[] = [];
    const osBrandsMatched: string[] = [];
    const osBrandsUnmatched: string[] = [];
    const oosSeen = new Set<string>();

    for (const brandName of osBrands) {
      const brand = brandByKey.get(normalizeBrandKey(brandName));
      if (!brand) {
        osBrandsUnmatched.push(brandName);
        continue;
      }
      osBrandsMatched.push(brand.name);
      for (const match of variantsByBrandId.get(brand.id) ?? []) {
        if (oosSeen.has(match.variant.id)) continue;
        oosSeen.add(match.variant.id);
        oosTargets.push({
          variantId: match.variant.id,
          productId: match.variant.productId,
          sku: match.variant.sku,
          brandName: brand.name,
          alreadyOos: match.variant.outOfStock === true,
        });
      }
    }

    let deliveryTargets = [...deliveryMap.values()].filter(
      (t) => t.previous !== t.estimatedDeliveryTime,
    );
    let oosToUpdate = oosTargets.filter((t) => !t.alreadyOos);

    if (opts.limit) {
      deliveryTargets = deliveryTargets.slice(0, opts.limit);
      oosToUpdate = oosToUpdate.slice(0, opts.limit);
    }

    // Spot-check overlap SKUs from the plan
    for (const checkSku of ['Pai/Vis/01427', 'Hea/Vis/02556']) {
      const match = variantsBySku.get(checkSku.toLowerCase());
      const planned = match ? deliveryMap.get(match.variant.id) : undefined;
      console.log(
        `[estimate-delivery] spot-check ${checkSku}:`,
        planned
          ? { from: planned.from, estimatedDeliveryTime: planned.estimatedDeliveryTime }
          : match
            ? 'matched variant but no delivery plan'
            : 'SKU not in DB',
      );
    }

    console.log(
      `[estimate-delivery] summary brandsMatched=${brandsMatched} brandsUnmatched=${unmatchedBrands.length} ` +
        `deliveryPlanned=${deliveryMap.size} deliveryChanging=${deliveryTargets.length} ` +
        `skuUnmatched=${unmatchedSkus.length} oosVariants=${oosTargets.length} oosChanging=${oosToUpdate.length} ` +
        `osBrandsMatched=${osBrandsMatched.length} osBrandsUnmatched=${osBrandsUnmatched.length} ` +
        `brandDayConflicts=${brandSheet.conflicts.length}`,
    );

    if (unmatchedBrands.length) {
      console.log(
        `[estimate-delivery] brand sheet unmatched (first 30):`,
        unmatchedBrands.slice(0, 30),
      );
    }
    if (osBrandsUnmatched.length) {
      console.log(
        `[estimate-delivery] OS brands unmatched (first 30):`,
        osBrandsUnmatched.slice(0, 30),
      );
    }
    if (unmatchedSkus.length) {
      const bySheet = new Map<string, number>();
      for (const u of unmatchedSkus) {
        bySheet.set(u.sheet, (bySheet.get(u.sheet) ?? 0) + 1);
      }
      console.log(`[estimate-delivery] unmatched SKU counts by sheet:`, Object.fromEntries(bySheet));
      console.log(
        `[estimate-delivery] unmatched SKUs sample (first 30):`,
        unmatchedSkus.slice(0, 30),
      );
    }

    if (!opts.apply) {
      console.log(
        '[estimate-delivery] dry-run delivery sample:',
        JSON.stringify(
          deliveryTargets.slice(0, 20).map((t) => ({
            sku: t.sku,
            from: t.from,
            previous: t.previous,
            next: t.estimatedDeliveryTime,
          })),
          null,
          2,
        ),
      );
      console.log(
        '[estimate-delivery] dry-run OOS sample:',
        JSON.stringify(
          oosToUpdate.slice(0, 20).map((t) => ({
            sku: t.sku,
            brandName: t.brandName,
            action: 'set outOfStock=true',
          })),
          null,
          2,
        ),
      );
      console.log('[estimate-delivery] dry-run complete — re-run with --apply to persist');
      return;
    }

    const chunkSize = 500;
    let deliveryUpdated = 0;

    // Group delivery updates by target value for efficient batched UPDATEs
    const byValue = new Map<string, DeliveryTarget[]>();
    for (const t of deliveryTargets) {
      const list = byValue.get(t.estimatedDeliveryTime) ?? [];
      list.push(t);
      byValue.set(t.estimatedDeliveryTime, list);
    }

    for (const [value, targets] of byValue) {
      for (let i = 0; i < targets.length; i += chunkSize) {
        const batch = targets.slice(i, i + chunkSize);
        const ids = batch.map((t) => t.variantId);
        await variantRepo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({ estimatedDeliveryTime: value } as Partial<ProductVariantEntity>)
          .whereInIds(ids)
          .execute();
        deliveryUpdated += batch.length;
        console.log(
          `[estimate-delivery] delivery "${value}" updated ${deliveryUpdated}/${deliveryTargets.length}`,
        );
      }
    }

    let oosUpdated = 0;
    for (let i = 0; i < oosToUpdate.length; i += chunkSize) {
      const batch = oosToUpdate.slice(i, i + chunkSize);
      const ids = batch.map((t) => t.variantId);
      await variantRepo
        .createQueryBuilder()
        .update(ProductVariantEntity)
        .set({ outOfStock: true } as Partial<ProductVariantEntity>)
        .whereInIds(ids)
        .execute();
      oosUpdated += batch.length;
      console.log(`[estimate-delivery] OOS updated ${oosUpdated}/${oosToUpdate.length}`);
    }

    const touchedProductIds = [
      ...new Set([
        ...deliveryTargets.map((t) => t.productId),
        ...oosToUpdate.map((t) => t.productId),
      ]),
    ];

    if (touchedProductIds.length) {
      const products = await productRepo
        .createQueryBuilder('p')
        .select(['p.id', 'p.refId'])
        .where('p.id IN (:...ids)', { ids: touchedProductIds })
        .getMany();
      const cacheResult = await invalidateProductCache(
        products.map((p) => ({ refId: p.refId })),
        false,
      );
      console.log(
        `[estimate-delivery] cacheKeysDeleted=${cacheResult.keysDeleted} redis=${cacheResult.connected}`,
      );
    }

    console.log(
      `[estimate-delivery] done deliveryUpdated=${deliveryUpdated} oosUpdated=${oosUpdated}`,
    );
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[estimate-delivery] failed:', error);
    process.exit(1);
  });
