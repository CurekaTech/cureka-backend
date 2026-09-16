/**
 * Fix mismatched variant SKUs from SKU-Code-Mismatch.xlsx.
 *
 * Sheet columns:
 *   WP Product ID  → variant.external_product_id (match key, preferred)
 *   WP SKU         → correct SKU to write into our DB
 *   Beta SKU       → current (wrong) SKU in our system (fallback match)
 *   Beta Product ID→ same as WP Product ID (also usable as external_product_id)
 *
 * Matching:
 *   1. external_product_id = WP Product ID (or Beta Product ID)
 *   2. fallback: sku = Beta SKU (case-insensitive)
 * Then set variant.sku = WP SKU.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:sku-fix
 *   npm run product:sku-fix -- --apply
 *   npm run product:sku-fix -- --file="docs/Master-Data-Sheets/SKU-Code-Mismatch.xlsx" --apply --limit=20
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_FILE = 'docs/Master-Data-Sheets/SKU-Code-Mismatch.xlsx';

interface CliOptions {
  file: string;
  apply: boolean;
  limit?: number;
  sheet?: string;
}

interface SheetRow {
  wpProductId: string;
  wpSku: string;
  betaProductId: string;
  betaSku: string;
  productName: string;
}

interface Target {
  variantId: string;
  productId: string;
  currentSku: string;
  newSku: string;
  externalProductId: string | null;
  matchedBy: 'external_id' | 'beta_sku';
  productName: string;
}

const absolutePath = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.cwd(), p);

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return (v).richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: string }).text).trim();
  }
  return String(v).trim();
};

const printUsage = (): void => {
  console.log(`
product:sku-fix — Replace mismatched Beta SKUs with WP SKUs

Options:
  --file <path>   XLSX file  (default: ${DEFAULT_FILE})
  --sheet <name>  Worksheet name (default: first sheet)
  --apply         Persist changes to DB (default: dry-run)
  --limit <n>     Process at most N variants
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
    if (arg === '--sheet' || arg.startsWith('--sheet=')) {
      opts.sheet = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
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

const readSheet = async (filePath: string, sheetName?: string): Promise<SheetRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? (workbook.getWorksheet(sheetName) ?? workbook.worksheets[0])
    : workbook.worksheets[0];

  if (!worksheet) throw new Error(`No worksheet found in ${filePath}`);

  let wpIdCol = 0;
  let wpSkuCol = 0;
  let betaIdCol = 0;
  let betaSkuCol = 0;
  let nameCol = 0;

  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (header === 'wp product id') wpIdCol = colNumber;
    else if (header === 'wp sku') wpSkuCol = colNumber;
    else if (header === 'beta product id') betaIdCol = colNumber;
    else if (header === 'beta sku') betaSkuCol = colNumber;
    else if (header === 'product name') nameCol = colNumber;
  });

  const missing: string[] = [];
  if (!wpSkuCol) missing.push('"WP SKU"');
  if (!betaSkuCol && !wpIdCol && !betaIdCol) {
    missing.push('"Beta SKU" or "WP Product ID" / "Beta Product ID"');
  }
  if (missing.length) {
    const found = (worksheet.getRow(1).values as (string | undefined)[])
      ?.slice(1)
      .filter(Boolean)
      .join(', ');
    throw new Error(`Missing required columns: ${missing.join(', ')}. Found: ${found}`);
  }

  console.log(
    `[sku-fix] columns → WP Product ID=${wpIdCol || 'n/a'} WP SKU=${wpSkuCol}` +
      ` Beta Product ID=${betaIdCol || 'n/a'} Beta SKU=${betaSkuCol || 'n/a'}` +
      ` in sheet "${worksheet.name}"`,
  );

  const rows: SheetRow[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const wpSku = normalizeText(row.getCell(wpSkuCol));
    if (!wpSku) continue;

    rows.push({
      wpProductId: wpIdCol ? normalizeText(row.getCell(wpIdCol)) : '',
      wpSku,
      betaProductId: betaIdCol ? normalizeText(row.getCell(betaIdCol)) : '',
      betaSku: betaSkuCol ? normalizeText(row.getCell(betaSkuCol)) : '',
      productName: nameCol ? normalizeText(row.getCell(nameCol)) : '',
    });
  }

  return rows;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const filePath = absolutePath(opts.file);

  console.log(`[sku-fix] file=${filePath}`);
  console.log(`[sku-fix] apply=${opts.apply}${opts.limit ? ` limit=${opts.limit}` : ''}`);

  const sheetRows = await readSheet(filePath, opts.sheet);
  if (!sheetRows.length) throw new Error('Sheet is empty or has no valid WP SKU rows');
  console.log(`[sku-fix] sheet rows=${sheetRows.length}`);

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);

    const allVariants = await variantRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.productId', 'v.sku', 'v.externalProductId'])
      .where('v.deleted_at IS NULL')
      .getMany();

    const byExternalId = new Map<string, ProductVariantEntity>();
    const bySku = new Map<string, ProductVariantEntity>();
    for (const v of allVariants) {
      if (v.externalProductId?.trim()) {
        byExternalId.set(v.externalProductId.trim().toLowerCase(), v);
      }
      bySku.set(v.sku.trim().toLowerCase(), v);
    }

    const targets: Target[] = [];
    const notFound: string[] = [];
    const alreadyCorrect: string[] = [];
    const conflicts: string[] = [];
    const seenVariantIds = new Set<string>();
    const plannedNewSkus = new Map<string, string>(); // lower(newSku) → variantId

    for (const row of sheetRows) {
      const extKey = (row.wpProductId || row.betaProductId).toLowerCase();
      const betaSkuKey = row.betaSku.toLowerCase();
      const newSkuKey = row.wpSku.toLowerCase();

      let variant: ProductVariantEntity | undefined;
      let matchedBy: Target['matchedBy'] = 'beta_sku';

      if (extKey) {
        variant = byExternalId.get(extKey);
        if (variant) matchedBy = 'external_id';
      }
      if (!variant && betaSkuKey) {
        variant = bySku.get(betaSkuKey);
        if (variant) matchedBy = 'beta_sku';
      }

      if (!variant) {
        notFound.push(
          `wpSku=${row.wpSku} betaSku=${row.betaSku || '-'} externalId=${row.wpProductId || row.betaProductId || '-'}`,
        );
        continue;
      }

      if (seenVariantIds.has(variant.id)) continue;
      seenVariantIds.add(variant.id);

      if (variant.sku.trim().toLowerCase() === newSkuKey) {
        alreadyCorrect.push(variant.sku);
        continue;
      }

      // Conflict: another DB variant already owns the WP SKU
      const existingOwner = bySku.get(newSkuKey);
      if (existingOwner && existingOwner.id !== variant.id) {
        conflicts.push(
          `wpSku=${row.wpSku} already used by variantId=${existingOwner.id} sku=${existingOwner.sku}` +
            ` — cannot rename ${variant.sku}`,
        );
        continue;
      }

      // Conflict within this sheet batch (two rows targeting same WP SKU)
      const plannedOwner = plannedNewSkus.get(newSkuKey);
      if (plannedOwner && plannedOwner !== variant.id) {
        conflicts.push(
          `wpSku=${row.wpSku} planned for multiple variants (${plannedOwner} and ${variant.id})`,
        );
        continue;
      }
      plannedNewSkus.set(newSkuKey, variant.id);

      targets.push({
        variantId: variant.id,
        productId: variant.productId,
        currentSku: variant.sku,
        newSku: row.wpSku,
        externalProductId: variant.externalProductId,
        matchedBy,
        productName: row.productName,
      });
    }

    const limited = opts.limit ? targets.slice(0, opts.limit) : targets;

    console.log(
      `[sku-fix] toUpdate=${limited.length} alreadyCorrect=${alreadyCorrect.length}` +
        ` notFound=${notFound.length} conflicts=${conflicts.length}`,
    );
    if (notFound.length) {
      console.log('[sku-fix] not found (first 20):', notFound.slice(0, 20));
    }
    if (conflicts.length) {
      console.warn('[sku-fix] conflicts (first 20):', conflicts.slice(0, 20));
    }

    if (!opts.apply) {
      const sample = limited.slice(0, 20).map((t) => ({
        productName: t.productName || undefined,
        matchedBy: t.matchedBy,
        externalProductId: t.externalProductId,
        currentSku: t.currentSku,
        newSku: t.newSku,
      }));
      console.log('[sku-fix] dry-run sample:', JSON.stringify(sample, null, 2));
      console.log('[sku-fix] dry-run complete — re-run with --apply to persist');
      return;
    }

    if (!limited.length) {
      console.log('[sku-fix] nothing to update');
      return;
    }

    let updated = 0;
    let failed = 0;
    const failures: string[] = [];
    const touchedProductIds: string[] = [];

    for (const target of limited) {
      try {
        // Re-check uniqueness right before write
        const clash = await variantRepo.findOne({
          where: { sku: target.newSku },
          select: ['id', 'sku'],
        });
        if (clash && clash.id !== target.variantId) {
          // Case-insensitive: also check if another row differs only by case
          failed++;
          failures.push(
            `sku=${target.currentSku} → ${target.newSku} conflict with existing variant ${clash.id}`,
          );
          continue;
        }

        // If unique index is case-sensitive and only case differs on same row, still update
        const caseClash = await variantRepo
          .createQueryBuilder('v')
          .select(['v.id', 'v.sku'])
          .where('LOWER(v.sku) = LOWER(:sku)', { sku: target.newSku })
          .andWhere('v.id != :id', { id: target.variantId })
          .andWhere('v.deleted_at IS NULL')
          .getOne();
        if (caseClash) {
          failed++;
          failures.push(
            `sku=${target.currentSku} → ${target.newSku} conflict with ${caseClash.sku} (${caseClash.id})`,
          );
          continue;
        }

        await variantRepo
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({ sku: target.newSku })
          .where('id = :id', { id: target.variantId })
          .execute();

        updated++;
        touchedProductIds.push(target.productId);
        if (updated % 25 === 0) {
          console.log(`[sku-fix] updated ${updated}/${limited.length}`);
        }
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`sku=${target.currentSku} → ${target.newSku} error=${msg}`);
        console.error(`[sku-fix] FAIL ${target.currentSku} → ${target.newSku}: ${msg}`);
      }
    }

    const uniqueProductIds = [...new Set(touchedProductIds)];
    let cacheKeysDeleted = 0;
    let redis = false;
    if (uniqueProductIds.length) {
      const products = await AppDataSource.query<Array<{ ref_id: string }>>(
        `SELECT ref_id FROM products WHERE id = ANY($1)`,
        [uniqueProductIds],
      );
      const cacheResult = await invalidateProductCache(
        products.map((p) => ({ refId: p.ref_id })),
        false,
      );
      cacheKeysDeleted = cacheResult.keysDeleted;
      redis = cacheResult.connected;
    }

    console.log(
      `[sku-fix] done updated=${updated} failed=${failed}` +
        ` cacheKeysDeleted=${cacheKeysDeleted} redis=${redis}`,
    );
    if (failures.length) {
      console.log('[sku-fix] failures:', failures.slice(0, 20));
    }
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[sku-fix] failed:', error);
    process.exit(1);
  });
