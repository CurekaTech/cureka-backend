/**
 * Bulk-upload conflict diagnostic
 *
 * PRIMARY USAGE — pass the bulk-upload job refId and the script does everything:
 *   npm run bulk-upload:diagnose -- --ref-id=BUP2026068220
 *
 * The script replicates the EXACT same lookup chain the validator uses:
 *   1. Look up the bulk-upload job record (status, errorSummary, fileUrl).
 *   2. Download the spreadsheet from GCS.
 *   3. Parse every data row: SKU, Vendor SKU, Product ID (String), Name, Brand.
 *   4. For every row, run the same 4-key resolution the validator runs:
 *        Key A  externalProductId  →  externalProductIdToProductRefIdMap
 *        Key B  vendorSku          →  vendorSkuToProductRefIdMap
 *        Key C  variant SKU(s)     →  skuToProductRefIdMap
 *        Key D  name + brand       →  productNameBrandToRefIdMap  (unique combos only)
 *   5. If keys A–D resolve to MORE THAN ONE product → CONFLICT.
 *   6. Show WHICH key pointed WHERE and the suggested fix.
 *
 * MANUAL USAGE:
 *   npm run bulk-upload:diagnose -- --skus=PAI/VIS/13810,PAI/VIS/13811
 *   npm run bulk-upload:diagnose -- --product-ids=384587,91197
 *   npm run bulk-upload:diagnose -- --skus=PAI/VIS/13810 --product-ids=384587
 */
import 'reflect-metadata';
import { isAbsolute, join } from 'path';
import { createWriteStream, existsSync } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Storage } from '@google-cloud/storage';
import * as ExcelJS from 'exceljs';
import { AppDataSource } from '../data-source';

// ──────────────────────────────────────────────────────────────────────────────
// CLI parsing
// ──────────────────────────────────────────────────────────────────────────────

interface CliOptions {
  refId: string | null;
  skus: string[];
  productIds: string[];
}

const printUsage = (): void => {
  console.log(`
Bulk-upload conflict diagnostic

PRIMARY USAGE (auto-downloads and parses the uploaded file):
  npm run bulk-upload:diagnose -- --ref-id=BUP2026068220

MANUAL USAGE:
  npm run bulk-upload:diagnose -- --skus=PAI/VIS/13810,PAI/VIS/13811
  npm run bulk-upload:diagnose -- --product-ids=384587,91197
  npm run bulk-upload:diagnose -- --skus=PAI/VIS/13810 --product-ids=384587
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { refId: null, skus: [], productIds: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0); }
    if (arg.startsWith('--ref-id=')) { options.refId = arg.slice('--ref-id='.length).trim(); }
    else if (arg === '--ref-id' && argv[i + 1] && !argv[i + 1]!.startsWith('--')) { options.refId = argv[++i]!.trim(); }
    if (arg.startsWith('--skus=')) { options.skus.push(...arg.slice('--skus='.length).split(',').map(s => s.trim()).filter(Boolean)); }
    else if (arg === '--skus' && argv[i + 1] && !argv[i + 1]!.startsWith('--')) { options.skus.push(...argv[++i]!.split(',').map(s => s.trim()).filter(Boolean)); }
    if (arg.startsWith('--product-ids=')) { options.productIds.push(...arg.slice('--product-ids='.length).split(',').map(s => s.trim()).filter(Boolean)); }
    else if (arg === '--product-ids' && argv[i + 1] && !argv[i + 1]!.startsWith('--')) { options.productIds.push(...argv[++i]!.split(',').map(s => s.trim()).filter(Boolean)); }
  }
  return options;
};

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface BulkUploadRecord {
  id: string;
  refId: string;
  status: string;
  fileUrl: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  errorSummary: Array<{ row?: number; reason?: string; message?: string; sku?: string; column?: string; [k: string]: unknown }>;
  createdAt: Date;
  completedAt: Date | null;
}

interface ProductRow {
  id: string;
  refId: string;
  name: string;
  slug: string;
  externalProductId: string | null;
  status: string;
}

interface VariantRow {
  id: string;
  sku: string;
  vendorSku: string | null;
  externalProductId: string | null;
  status: string;
  product_id: string;
  product_ref_id: string;
  product_name: string;
  product_slug: string;
  product_status: string;
  product_external_id: string | null;
}

/** One parsed row from the spreadsheet */
interface SheetRow {
  rowNumber: number;
  sku: string;         // Product SKU Code
  vendorSku: string;   // Barcode / vendor SKU (used as a secondary key by validator)
  productId: string;   // Product ID (String) = externalProductId
  name: string;
  brand: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// DB query helpers
// ──────────────────────────────────────────────────────────────────────────────

async function fetchBulkUploadJob(db: typeof AppDataSource, refId: string): Promise<BulkUploadRecord | null> {
  const rows = await db.query<BulkUploadRecord[]>(`
    SELECT
      id,
      ref_id           AS "refId",
      status,
      file_url         AS "fileUrl",
      total_rows       AS "totalRows",
      processed_rows   AS "processedRows",
      successful_rows  AS "successfulRows",
      failed_rows      AS "failedRows",
      error_summary    AS "errorSummary",
      created_at       AS "createdAt",
      completed_at     AS "completedAt"
    FROM bulk_uploads
    WHERE ref_id = $1 AND deleted_at IS NULL
  `, [refId]);
  return rows[0] ?? null;
}

// ── Key A: externalProductId → product refId ─────────────────────────────────
async function fetchProductsByExternalId(db: typeof AppDataSource, externalIds: string[]): Promise<ProductRow[]> {
  if (!externalIds.length) return [];
  return db.query<ProductRow[]>(`
    SELECT id, ref_id AS "refId", name, slug,
           external_product_id AS "externalProductId", status
    FROM products
    WHERE LOWER(external_product_id) = ANY($1)
    ORDER BY name
  `, [externalIds.map(s => s.toLowerCase())]);
}

// ── Key B: vendorSku → product refId (via product_variants.vendor_sku) ───────
async function fetchVariantsByVendorSku(db: typeof AppDataSource, vendorSkus: string[]): Promise<VariantRow[]> {
  if (!vendorSkus.length) return [];
  return db.query<VariantRow[]>(`
    SELECT pv.id, pv.sku,
           pv.vendor_sku          AS "vendorSku",
           pv.external_product_id AS "externalProductId",
           pv.status,
           p.id                   AS "product_id",
           p.ref_id               AS "product_ref_id",
           p.name                 AS "product_name",
           p.slug                 AS "product_slug",
           p.status               AS "product_status",
           p.external_product_id  AS "product_external_id"
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.deleted_at IS NULL
      AND LOWER(pv.vendor_sku) = ANY($1)
    ORDER BY pv.sku
  `, [vendorSkus.map(s => s.toLowerCase())]);
}

// ── Key C: SKU → product refId ────────────────────────────────────────────────
async function fetchVariantsBySku(db: typeof AppDataSource, skus: string[]): Promise<VariantRow[]> {
  if (!skus.length) return [];
  return db.query<VariantRow[]>(`
    SELECT pv.id, pv.sku,
           pv.vendor_sku          AS "vendorSku",
           pv.external_product_id AS "externalProductId",
           pv.status,
           p.id                   AS "product_id",
           p.ref_id               AS "product_ref_id",
           p.name                 AS "product_name",
           p.slug                 AS "product_slug",
           p.status               AS "product_status",
           p.external_product_id  AS "product_external_id"
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.deleted_at IS NULL
      AND LOWER(pv.sku) = ANY($1)
    ORDER BY pv.sku
  `, [skus.map(s => s.toLowerCase())]);
}

// ── Key D: name + brand → product refId (unique combos only) ─────────────────
async function fetchProductsByNameAndBrand(db: typeof AppDataSource, pairs: Array<{ name: string; brand: string }>): Promise<Array<{ refId: string; name: string; brandName: string }>> {
  if (!pairs.length) return [];
  // Fetch all products with brand, then filter in JS the same way the validator does
  const rows = await db.query<Array<{ refId: string; name: string; brandName: string }>>(`
    SELECT p.ref_id AS "refId", p.name, b.name AS "brandName"
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.deleted_at IS NULL
  `);
  // Replicate validator: build name|brand → count, then only use unique ones
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.name?.toLowerCase().trim()}|${r.brandName?.toLowerCase().trim()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const inputKeys = new Set(pairs.map(p => `${p.name.toLowerCase().trim()}|${p.brand.toLowerCase().trim()}`));
  return rows.filter(r => {
    const key = `${r.name?.toLowerCase().trim()}|${r.brandName?.toLowerCase().trim()}`;
    return inputKeys.has(key) && counts.get(key) === 1;
  });
}

async function fetchAllVariantSkusForProduct(db: typeof AppDataSource, productId: string): Promise<string[]> {
  const rows = await db.query<{ sku: string }[]>(`
    SELECT sku FROM product_variants
    WHERE product_id = $1 AND deleted_at IS NULL
    ORDER BY sku
  `, [productId]);
  return rows.map(r => r.sku);
}

// ──────────────────────────────────────────────────────────────────────────────
// GCS download helper
// ──────────────────────────────────────────────────────────────────────────────

async function downloadFileFromGcs(fileUrl: string, destPath: string): Promise<void> {
  const credRaw = process.env['GCS_CREDENTIALS_PATH'] ?? 'secrets/gcs-service-account.json';
  const credPath = isAbsolute(credRaw) ? credRaw : join(process.cwd(), credRaw);
  const bucket = process.env['GCS_BUCKET_NAME'];
  if (!bucket) throw new Error('GCS_BUCKET_NAME env variable is not set.');
  if (!existsSync(credPath)) throw new Error(`GCS credentials not found at "${credPath}".`);

  const storage = new Storage({ keyFilename: credPath });
  let relativePath = fileUrl;
  const m = fileUrl.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/i);
  if (m?.[1]) relativePath = m[1].split('?')[0]!;

  await pipeline(storage.bucket(bucket).file(relativePath).createReadStream(), createWriteStream(destPath));
}

// ──────────────────────────────────────────────────────────────────────────────
// XLSX / CSV parser — extract per-row key fields
// ──────────────────────────────────────────────────────────────────────────────

const SKU_COLS     = ['product sku code', 'sku code', 'sku'];
const VENDOR_COLS  = ['barcode (ean/upc)', 'barcode', 'vendor sku', 'ean/upc'];
const PID_COLS     = ['product id (string)', 'product id', 'product id string', 'external product id', 'woocommerce product id'];
const NAME_COLS    = ['product name'];
const BRAND_COLS   = ['brand'];
const MANDATORY    = ['product name', 'product type', 'category'];
const MAX_SCAN     = 15;

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return (value as any).richText.map((r: any) => r.text ?? '').join('').trim();
    if ('text' in value) return String((value as any).text ?? '').trim();
    if ('result' in value) return String((value as any).result ?? '').trim();
  }
  return String(value).trim();
}

function buildHeaderMap(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  row.eachCell((cell, col) => {
    const k = cellText(cell.value).toLowerCase();
    if (k) map.set(k, col);
  });
  return map;
}

function hasRequiredHeaders(m: Map<string, number>): boolean {
  return MANDATORY.every(h => m.has(h));
}

function firstCol(map: Map<string, number>, names: string[]): number | undefined {
  for (const n of names) if (map.has(n)) return map.get(n);
  return undefined;
}

async function parseSheetRows(filePath: string): Promise<SheetRow[]> {
  const results: SheetRow[] = [];
  const isCsv = filePath.toLowerCase().endsWith('.csv');
  const workbook = new ExcelJS.Workbook();

  let worksheet: ExcelJS.Worksheet;
  if (isCsv) {
    worksheet = await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
    const TARGET = 'bulk import template';
    worksheet = workbook.worksheets.find(ws => ws.name.toLowerCase().trim() === TARGET)
      ?? workbook.worksheets.find(ws => !ws.name.toLowerCase().includes('reference') && !ws.name.toLowerCase().includes('dropdown'))
      ?? workbook.worksheets[0]!;
  }
  if (!worksheet) throw new Error('No worksheet found.');

  // Find header row
  let headerRow = 1;
  let hMap = new Map<string, number>();
  const maxScan = Math.min(worksheet.rowCount || 1, MAX_SCAN);
  for (let r = 1; r <= maxScan; r++) {
    const candidate = buildHeaderMap(worksheet.getRow(r));
    if (hasRequiredHeaders(candidate)) { headerRow = r; hMap = candidate; break; }
  }
  if (!hMap.size) throw new Error(`Could not find header row (product name, product type, category) in sheet "${worksheet.name}".`);

  console.log(`  Sheet       : "${worksheet.name}"`);
  console.log(`  Header row  : ${headerRow}`);
  console.log(`  SKU col     : ${SKU_COLS.find(n => hMap.has(n)) ?? '(not found)'}`);
  console.log(`  Vendor col  : ${VENDOR_COLS.find(n => hMap.has(n)) ?? '(not found)'}`);
  console.log(`  PID col     : ${PID_COLS.find(n => hMap.has(n)) ?? '(not found)'}`);

  const skuCol    = firstCol(hMap, SKU_COLS);
  const vendorCol = firstCol(hMap, VENDOR_COLS);
  const pidCol    = firstCol(hMap, PID_COLS);
  const nameCol   = firstCol(hMap, NAME_COLS);
  const brandCol  = firstCol(hMap, BRAND_COLS);

  for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const get = (col?: number) => col ? cellText(row.getCell(col).value) : '';
    const sku       = get(skuCol);
    const vendorSku = get(vendorCol);
    const productId = get(pidCol);
    const name      = get(nameCol);
    const brand     = get(brandCol);
    if (sku || vendorSku || productId || name) {
      results.push({ rowNumber: r, sku, vendorSku, productId, name, brand });
    }
  }
  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// Replication of validator's resolveExistingProductRefIdForGroup logic
// ──────────────────────────────────────────────────────────────────────────────

interface KeyResolution {
  key: string;
  value: string;
  resolvedRefId: string | null;
  productName: string;
  productExtId: string | null;
  query: string;
}

interface RowAnalysis {
  rowNumber: number;
  sku: string;
  vendorSku: string;
  productId: string;
  name: string;
  brand: string;
  resolutions: KeyResolution[];
  uniqueRefIds: string[];
  hasConflict: boolean;
  isAllNew: boolean;
}

async function analyzeRow(db: typeof AppDataSource, row: SheetRow): Promise<RowAnalysis> {
  const resolutions: KeyResolution[] = [];

  // ── Key A: Product ID (String) = externalProductId ─────────────────────────
  if (row.productId) {
    const query = `SELECT ref_id, name, external_product_id FROM products WHERE LOWER(external_product_id) = '${row.productId.toLowerCase()}'`;
    const rows = await fetchProductsByExternalId(db, [row.productId]);
    resolutions.push({
      key: 'Key A (Product ID)',
      value: row.productId,
      resolvedRefId: rows[0]?.refId ?? null,
      productName: rows[0]?.name ?? '—',
      productExtId: rows[0]?.externalProductId ?? null,
      query,
    });
  }

  // ── Key B: Vendor SKU / Barcode ─────────────────────────────────────────────
  if (row.vendorSku) {
    const query = `SELECT pv.vendor_sku, p.ref_id, p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE LOWER(pv.vendor_sku) = '${row.vendorSku.toLowerCase()}' AND pv.deleted_at IS NULL`;
    const rows = await fetchVariantsByVendorSku(db, [row.vendorSku]);
    resolutions.push({
      key: 'Key B (Vendor SKU / Barcode)',
      value: row.vendorSku,
      resolvedRefId: rows[0]?.product_ref_id ?? null,
      productName: rows[0]?.product_name ?? '—',
      productExtId: rows[0]?.product_external_id ?? null,
      query,
    });
  }

  // ── Key C: SKU ──────────────────────────────────────────────────────────────
  if (row.sku) {
    const query = `SELECT pv.sku, p.ref_id, p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE LOWER(pv.sku) = '${row.sku.toLowerCase()}' AND pv.deleted_at IS NULL`;
    const rows = await fetchVariantsBySku(db, [row.sku]);
    resolutions.push({
      key: 'Key C (SKU)',
      value: row.sku,
      resolvedRefId: rows[0]?.product_ref_id ?? null,
      productName: rows[0]?.product_name ?? '—',
      productExtId: rows[0]?.product_external_id ?? null,
      query,
    });
  }

  // ── Key D: name + brand (only unique combos used) ───────────────────────────
  if (row.name && row.brand) {
    const query = `SELECT p.ref_id, p.name, b.name AS brandName FROM products p JOIN brands b ON b.id = p.brand_id WHERE LOWER(p.name) = '${row.name.toLowerCase().trim()}' AND LOWER(b.name) = '${row.brand.toLowerCase().trim()}' AND p.deleted_at IS NULL`;
    const rows = await fetchProductsByNameAndBrand(db, [{ name: row.name, brand: row.brand }]);
    resolutions.push({
      key: 'Key D (Name + Brand)',
      value: `${row.name} | ${row.brand}`,
      resolvedRefId: rows[0]?.refId ?? null,
      productName: rows[0]?.name ?? '—',
      productExtId: null,
      query,
    });
  }

  const resolvedRefIds = [...new Set(resolutions.map(r => r.resolvedRefId).filter(Boolean) as string[])];

  return {
    rowNumber: row.rowNumber,
    sku: row.sku,
    vendorSku: row.vendorSku,
    productId: row.productId,
    name: row.name,
    brand: row.brand,
    resolutions,
    uniqueRefIds: resolvedRefIds,
    hasConflict: resolvedRefIds.length > 1,
    isAllNew: resolvedRefIds.length === 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Manual-mode conflict report (--skus / --product-ids)
// ──────────────────────────────────────────────────────────────────────────────

async function runManualConflictReport(
  db: typeof AppDataSource,
  skus: string[],
  productIds: string[],
  SEP: string,
): Promise<void> {
  if (skus.length) {
    console.log(`\n${SEP}\nSKU LOOKUP\n${SEP}`);
    console.log(`  SQL: SELECT pv.sku, p.ref_id, p.name ... FROM product_variants pv JOIN products p ... WHERE LOWER(pv.sku) = ANY([...skus])`);
    const variantRows = await fetchVariantsBySku(db, skus);
    const foundSkus = new Set(variantRows.map(r => r.sku.toLowerCase()));
    const notFound = skus.filter(s => !foundSkus.has(s.toLowerCase()));
    if (notFound.length) { console.log(`\n  ✅ NEW (not in DB):`); notFound.forEach(s => console.log(`     ${s}`)); }
    if (variantRows.length) {
      console.log(`\n  ⚠️  EXISTING:`);
      for (const row of variantRows) {
        const all = await fetchAllVariantSkusForProduct(db, row.product_id);
        console.log(`
    SKU         : ${row.sku}
    Variant ID  : ${row.id}
    Variant Ext : ${row.externalProductId ?? '(none)'}
    Status      : ${row.status}
    ↳ Product   : ${row.product_ref_id}  "${row.product_name}"
      Ext ID    : ${row.product_external_id ?? '(none)'}
      P.Status  : ${row.product_status}
      All SKUs  : ${all.join(', ')}`);
      }
    }
  }

  if (productIds.length) {
    console.log(`\n${SEP}\nPRODUCT ID (String) LOOKUP\n${SEP}`);
    console.log(`  SQL: SELECT id, ref_id, name, external_product_id FROM products WHERE LOWER(external_product_id) = ANY([...ids])`);
    const productRows = await fetchProductsByExternalId(db, productIds);
    const foundIds = new Set(productRows.map(r => r.externalProductId?.toLowerCase().trim()));
    const notFound = productIds.filter(id => !foundIds.has(id.toLowerCase()));
    if (notFound.length) { console.log(`\n  ✅ UNUSED (not in DB):`); notFound.forEach(id => console.log(`     ${id}`)); }
    if (productRows.length) {
      console.log(`\n  ⚠️  EXISTING:`);
      for (const p of productRows) {
        const all = await fetchAllVariantSkusForProduct(db, p.id);
        console.log(`
    Ext ID      : ${p.externalProductId}
    Product     : ${p.refId}  "${p.name}"
    Status      : ${p.status}
    All SKUs    : ${all.join(', ')}`);
      }
    }
  }

  if (skus.length && productIds.length) {
    console.log(`\n${SEP}\nCONFLICT ANALYSIS\n${SEP}`);
    const variantRows  = await fetchVariantsBySku(db, skus);
    const productRows  = await fetchProductsByExternalId(db, productIds);
    const refsBySkus   = new Set(variantRows.map(r => r.product_ref_id));
    const refsByPids   = new Set(productRows.map(r => r.refId));
    const allRefs      = new Set([...refsBySkus, ...refsByPids]);

    if (allRefs.size === 0) {
      console.log('\n  ✅ No existing records — all inputs are new.');
    } else if (allRefs.size === 1) {
      console.log(`\n  ✅ All inputs resolve to the SAME product: ${[...allRefs][0]}`);
    } else {
      console.log(`\n  ❌ CONFLICT — inputs resolve to DIFFERENT products:`);
      console.log(`     SKU keys   → ${[...refsBySkus].join(', ') || '(none)'}`);
      console.log(`     PID keys   → ${[...refsByPids].join(', ') || '(none)'}`);
      console.log(`\n  WHY: The validator uses both SKU and Product ID as lookup keys.`);
      console.log(`       If they point to different existing products it rejects the row.`);
      console.log(`\n  FIX: Clear "Product ID (String)" OR update it to match the SKU's product.`);
      for (const row of variantRows)  console.log(`     SKU "${row.sku}" → ${row.product_ref_id} (Ext: ${row.product_external_id ?? 'none'})`);
      for (const p   of productRows)  console.log(`     Ext ID "${p.externalProductId}" → ${p.refId}`);
    }
  }

  if (skus.length > 1) {
    const lower = skus.map(s => s.toLowerCase()), seen = new Set<string>(), dupes: string[] = [];
    for (const sku of lower) { if (seen.has(sku)) dupes.push(sku); else seen.add(sku); }
    if (dupes.length) {
      console.log(`\n${SEP}\nDUPLICATE SKUs IN YOUR INPUT\n${SEP}`);
      console.log(`\n  ❌ Duplicated: ${dupes.join(', ')}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  if (!cli.refId && !cli.skus.length && !cli.productIds.length) { printUsage(); throw new Error('Provide --ref-id, --skus, and/or --product-ids'); }

  await AppDataSource.initialize();
  const SEP = '─'.repeat(72);

  try {
    if (cli.refId) {
      // ══════════════════════════════════════════════════════════════════════
      // MODE A — ref-id: auto-download + full row-by-row analysis
      // ══════════════════════════════════════════════════════════════════════
      console.log(`\n${SEP}\nBULK-UPLOAD JOB: ${cli.refId}\n${SEP}`);

      const job = await fetchBulkUploadJob(AppDataSource, cli.refId);
      if (!job) {
        console.log(`\n  ❌ No record found for refId "${cli.refId}".`);
        console.log(`     Check the refId in the admin panel → Bulk Uploads history.`);
        return;
      }

      console.log(`\n  Status       : ${job.status}`);
      console.log(`  File URL     : ${job.fileUrl}`);
      console.log(`  Total rows   : ${job.totalRows}`);
      console.log(`  Processed    : ${job.processedRows}`);
      console.log(`  Successful   : ${job.successfulRows}`);
      console.log(`  Failed       : ${job.failedRows}`);
      console.log(`  Created at   : ${job.createdAt}`);
      console.log(`  Completed at : ${job.completedAt ?? '(pending)'}`);

      // ── Stored error summary ─────────────────────────────────────────────
      const errors = Array.isArray(job.errorSummary) ? job.errorSummary : [];
      console.log(`\n${SEP}\nSTORED ERRORS (errorSummary saved by the job processor)\n${SEP}`);
      if (errors.length) {
        console.log(`  Total stored: ${errors.length}${errors.length >= 100 ? ' (capped at 100)' : ''}\n`);
        for (const err of errors) {
          const row    = err['row']    != null ? `Row ${err['row']}` : '';
          const sku    = err['sku']    ? ` | SKU: ${err['sku']}`    : '';
          const col    = err['column'] ? ` | Col: ${err['column']}` : '';
          const reason = err['reason'] ?? err['message'] ?? JSON.stringify(err);
          console.log(`  [${row}${sku}${col}]  ${reason}`);
        }
      } else {
        console.log('  (no errors stored — job may still be pending or errors were not recorded)');
      }

      if (!job.fileUrl) {
        console.log('\n  ⚠️  No fileUrl — cannot download & analyse rows.');
        return;
      }

      // ── Download file ────────────────────────────────────────────────────
      const tempDir  = join(process.cwd(), 'temp-diagnose');
      const ext      = job.fileUrl.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
      const tempFile = join(tempDir, `${cli.refId}-diagnose.${ext}`);
      await mkdir(tempDir, { recursive: true });

      try {
        console.log(`\n${SEP}\nDOWNLOADING & PARSING FILE\n${SEP}`);
        console.log(`  Downloading: ${job.fileUrl}`);
        await downloadFileFromGcs(job.fileUrl, tempFile);
        console.log('  Download complete. Parsing rows...');

        const sheetRows = await parseSheetRows(tempFile);
        console.log(`  Found ${sheetRows.length} data rows (with at least one key field).`);

        const uniqueSkus = [...new Set(sheetRows.map(r => r.sku).filter(Boolean))];
        const uniquePids = [...new Set(sheetRows.map(r => r.productId).filter(Boolean))];
        console.log(`  Unique SKUs       : ${uniqueSkus.length}`);
        console.log(`  Unique Product IDs: ${uniquePids.length}`);

        // ── Duplicate SKU within sheet ─────────────────────────────────────
        const skuCount = new Map<string, number>();
        for (const r of sheetRows) if (r.sku) skuCount.set(r.sku.toLowerCase(), (skuCount.get(r.sku.toLowerCase()) ?? 0) + 1);
        const dupSkus = [...skuCount.entries()].filter(([, c]) => c > 1).map(([s]) => s);

        if (dupSkus.length) {
          console.log(`\n${SEP}\nDUPLICATE SKUs WITHIN THE SPREADSHEET\n${SEP}`);
          console.log(`  These SKUs appear more than once — the validator will reject all duplicates:\n`);
          for (const sku of dupSkus) {
            const rows = sheetRows.filter(r => r.sku.toLowerCase() === sku);
            console.log(`  ❌ SKU "${sku}" — appears on rows: ${rows.map(r => r.rowNumber).join(', ')}`);
          }
          console.log(`\n  FIX: Each SKU must appear at most once. Remove or rename duplicates.`);
        }

        // ── Duplicate Product ID within sheet ──────────────────────────────
        const pidCount = new Map<string, number>();
        for (const r of sheetRows) if (r.productId) pidCount.set(r.productId.toLowerCase(), (pidCount.get(r.productId.toLowerCase()) ?? 0) + 1);
        const dupPids = [...pidCount.entries()].filter(([, c]) => c > 1).map(([p]) => p);

        if (dupPids.length) {
          console.log(`\n${SEP}\nDUPLICATE PRODUCT IDs WITHIN THE SPREADSHEET\n${SEP}`);
          console.log(`  The validator treats a reused Product ID as a conflict:\n`);
          for (const pid of dupPids) {
            const rows = sheetRows.filter(r => r.productId.toLowerCase() === pid);
            console.log(`  ❌ Product ID "${pid}" — appears on rows: ${rows.map(r => r.rowNumber).join(', ')}`);
          }
          console.log(`\n  FIX: Each product/variant row should have its own unique Product ID,`);
          console.log(`       OR leave it blank on rows that should resolve by SKU only.`);
        }

        // ── How the validator resolves a product — explanation ─────────────
        console.log(`\n${SEP}\nHOW THE VALIDATOR RESOLVES EACH ROW (lookup order)\n${SEP}`);
        console.log(`
  For every spreadsheet row the validator runs these 4 DB lookups IN ORDER
  and collects matching product refIds into a set:

  Key A  Product ID (String)   → products.external_product_id   (exact, case-insensitive)
         SQL: SELECT ref_id FROM products
              WHERE LOWER(external_product_id) = LOWER(:productId)

  Key B  Barcode / Vendor SKU  → product_variants.vendor_sku    (exact, case-insensitive)
         SQL: SELECT p.ref_id FROM product_variants pv
              JOIN products p ON p.id = pv.product_id
              WHERE LOWER(pv.vendor_sku) = LOWER(:vendorSku) AND pv.deleted_at IS NULL

  Key C  Product SKU Code      → product_variants.sku            (exact, case-insensitive)
         SQL: SELECT p.ref_id FROM product_variants pv
              JOIN products p ON p.id = pv.product_id
              WHERE LOWER(pv.sku) = LOWER(:sku) AND pv.deleted_at IS NULL

  Key D  Name + Brand          → products + brands               (unique combos only)
         SQL: SELECT p.ref_id FROM products p
              JOIN brands b ON b.id = p.brand_id
              WHERE LOWER(p.name) = LOWER(:name)
                AND LOWER(b.name) = LOWER(:brand)
                AND p.deleted_at IS NULL
              -- ONLY used when this name+brand combo is unique in the DB

  RESULT RULES:
    • If 0 refIds found   → CREATE new product (safe)
    • If 1 unique refId   → UPDATE that existing product (safe)
    • If 2+ different refIds → ❌ CONFLICT — row is rejected with:
        "Product ID belongs to a different existing product than the SKU/vendor match"
`);

        // ── Per-row analysis ───────────────────────────────────────────────
        const rowsToAnalyse = sheetRows.filter(r => r.sku || r.productId || r.vendorSku);
        console.log(`\n${SEP}\nPER-ROW ANALYSIS (${rowsToAnalyse.length} rows)\n${SEP}`);

        let conflictCount = 0;
        let newCount = 0;
        let updateCount = 0;

        for (const sheetRow of rowsToAnalyse) {
          const analysis = await analyzeRow(AppDataSource, sheetRow);

          if (analysis.isAllNew) {
            newCount++;
            // Only print new rows briefly
            continue;
          }

          if (analysis.hasConflict) {
            conflictCount++;
            console.log(`\n  ❌ CONFLICT on Row ${analysis.rowNumber}`);
            console.log(`     SKU="${analysis.sku || '—'}",  VendorSKU="${analysis.vendorSku || '—'}",  ProductID="${analysis.productId || '—'}"`);
            console.log(`     Name: "${analysis.name || '—'}",  Brand: "${analysis.brand || '—'}"`);
            console.log(`     Resolved refIds: ${analysis.uniqueRefIds.join(', ')}`);
            for (const r of analysis.resolutions) {
              const found = r.resolvedRefId ? `→ ${r.resolvedRefId}  "${r.productName}"` : '→ (not found — will create new)';
              console.log(`       ${r.key.padEnd(30)} value="${r.value}"  ${found}`);
              console.log(`         SQL: ${r.query}`);
            }
            console.log(`     FIX: Clear "Product ID (String)" on this row OR update it to`);
            console.log(`          match the product that owns the SKU.`);
          } else {
            updateCount++;
            // Print update rows at a glance
            const refId = analysis.uniqueRefIds[0];
            const matchedKey = analysis.resolutions.find(r => r.resolvedRefId === refId)?.key ?? '?';
            console.log(`\n  ✅ UPDATE on Row ${analysis.rowNumber}  →  ${refId}  (matched by ${matchedKey})`);
            console.log(`     SKU="${analysis.sku || '—'}",  VendorSKU="${analysis.vendorSku || '—'}",  ProductID="${analysis.productId || '—'}"`);
          }
        }

        console.log(`\n${SEP}\nSUMMARY\n${SEP}`);
        console.log(`  Total data rows   : ${rowsToAnalyse.length}`);
        console.log(`  ✅ New (create)    : ${newCount}`);
        console.log(`  ✅ Existing (update): ${updateCount}`);
        console.log(`  ❌ Conflicts       : ${conflictCount}`);
        if (conflictCount > 0) {
          console.log(`\n  Conflicted rows need to be fixed in the spreadsheet before re-uploading.`);
          console.log(`  Most common fix: clear "Product ID (String)" on conflicting rows and`);
          console.log(`  let the validator match by SKU alone.`);
        }

      } finally {
        try { await unlink(tempFile); } catch { /* ignore */ }
      }

    } else {
      // ══════════════════════════════════════════════════════════════════════
      // MODE B — manual --skus / --product-ids
      // ══════════════════════════════════════════════════════════════════════
      await runManualConflictReport(AppDataSource, cli.skus, cli.productIds, SEP);
    }

    console.log(`\n${SEP}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error('[bulk-upload:diagnose] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
