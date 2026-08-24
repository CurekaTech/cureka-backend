/**
 * Mark product variants as Top Products (`is_top = true`) by SKU list.
 *
 * 1. Put SKUs in `TOP_PRODUCT_SKUS` below
 * 2. Dry-run:  npm run product:mark-top
 * 3. Apply:    npm run product:mark-top -- --apply
 *
 * Matching is case-insensitive on `product_variants.sku` (non-deleted only).
 * Variants already `is_top = true` are skipped.
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { invalidateProductCache } from './product-cleanup.redis';

// ─────────────────────────────────────────────────────────────────────────────
// EDIT THIS LIST — add the SKUs you want marked as Top Products
// ─────────────────────────────────────────────────────────────────────────────
const TOP_PRODUCT_SKUS: string[] = [
  "HER/KER/07517",
  "HER/NOW/15110",
  "HER/TWO/09008",
  "NUT/ALT/16388",
  "Nut/Bru/01506",
  "Nut/Dab/00359",
  "SAM/SAM/11235",
  "Hea/3M/00006",
  "HEA/AMK/12937",
  "Hea/Bau/00086",
  "HEA/BEL/12011",
  "Hea/Nas/00399",
  "HEA/STA/15479",
  "HER/DAB/09526",
  "HER/SAP/09539",
  "HER/STB/09304",
  "NUT/ALT/16395",
  "NUT/APE/07614",
  "NUT/CAR/06142",
  "NUT/CIP/08540",
  "NUT/CIP/09621",
  "NUT/CIP/09651",
  "NUT/DRM/06512",
  "Nut/Fas/01190",
  "Nut/Fas/01192",
  "Nut/Fas/01196",
  "Nut/Fra/01919",
  "NUT/FRA/08649",
  "NUT/GOO/14548",
  "NUT/GOO/14551",
  "Nut/Hor/02023",
  "Nut/Hor/06570",
  "NUT/HOR/06656",
  "NUT/INE/08966",
  "NUT/MAX/07731",
  "NUT/ONL/13592",
  "NUT/ONL/15503",
  "NUT/ORS/08659",
  "NUT/PAN/15738",
  "NUT/RAP/09616",
  "NUT/SIX/09022",
  "NUT/ZIN/10722",
  "PAI/AIR/15581",
  "PAI/CIP/16684",
  "PAI/DRO/14520",
  "PAI/LAV/17732",
  "PAI/MAL/15419",
  "PAI/MAL/15577",
  "PAI/MED/16978",
  "PAI/MOO/08495",
  "PAI/MOO/09773",
  "SEX/MAX/07788",
  "SEX/VIG/05951",
  "SEX/VIG/06126",
  "SKI/CER/17412",
  "SKI/CER/17619",
  "SKI/CIP/09681",
  "SKI/CUR/07645",
  "SKI/DAB/15506",
  "Ski/Eth/01677",
  "Ski/Nak/01178",
  "Ski/Sou/00609",
  "SKI/STI/05339",
  "Wel/AVB/00060",
  "WEL/AXE/08646",
  "WEL/BEE/12453",
  "WEL/BEL/12616",
  "WEL/BEL/15487",
  "WEL/BUD/12855",
  "WEL/BUD/15181",
  "Wel/Col/01252",
  "WEL/DRO/06658",
  "WEL/DRU/18528"
];
// ─────────────────────────────────────────────────────────────────────────────

interface CliOptions {
  apply: boolean;
  limit?: number;
}

interface Target {
  variantId: string;
  productId: string;
  sku: string;
  alreadyTop: boolean;
}

const printUsage = (): void => {
  console.log(`
product:mark-top — Set is_top=true for SKUs listed in TOP_PRODUCT_SKUS

1. Edit TOP_PRODUCT_SKUS in:
   apps/api/database/scripts/product-mark-top.runner.ts
2. Dry-run:  npm run product:mark-top
3. Apply:    npm run product:mark-top -- --apply

Options:
  --apply       Persist changes to DB (default: dry-run)
  --limit <n>   Update at most N matched variants
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { apply: false };
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
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw = arg.includes('=') ? arg.split('=')[1] : argv[++i];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) opts.limit = Math.trunc(n);
    }
  }
  return opts;
};

const normalizeSku = (sku: string): string => sku.trim();

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));

  const skus = [
    ...new Set(TOP_PRODUCT_SKUS.map(normalizeSku).filter((sku) => Boolean(sku))),
  ];

  if (!skus.length) {
    throw new Error(
      'TOP_PRODUCT_SKUS is empty. Add SKUs in product-mark-top.runner.ts then re-run.',
    );
  }

  console.log(
    `[mark-top] skusInList=${skus.length} apply=${opts.apply}` +
      `${opts.limit ? ` limit=${opts.limit}` : ''}`,
  );

  await AppDataSource.initialize();
  try {
    const variantRepo = AppDataSource.getRepository(ProductVariantEntity);
    const lowered = skus.map((sku) => sku.toLowerCase());

    const matched = await variantRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.productId', 'v.sku', 'v.isTop'])
      .where('v.deletedAt IS NULL')
      .andWhere('LOWER(v.sku) IN (:...lowered)', { lowered })
      .getMany();

    const targets: Target[] = [];
    const notFound: string[] = [];
    const duplicateSkusInDb: string[] = [];

    for (const sku of skus) {
      const key = sku.toLowerCase();
      const hits = matched.filter((v) => v.sku.trim().toLowerCase() === key);
      if (!hits.length) {
        notFound.push(sku);
        continue;
      }
      if (hits.length > 1) {
        duplicateSkusInDb.push(sku);
      }
      for (const hit of hits) {
        targets.push({
          variantId: hit.id,
          productId: hit.productId,
          sku: hit.sku,
          alreadyTop: hit.isTop ?? false,
        });
      }
    }

    const limited = opts.limit ? targets.slice(0, opts.limit) : targets;
    const toUpdate = limited.filter((t) => !t.alreadyTop);
    const alreadyDone = limited.filter((t) => t.alreadyTop);

    console.log(
      `[mark-top] matched=${limited.length} toUpdate=${toUpdate.length} ` +
        `alreadyTop=${alreadyDone.length} notFound=${notFound.length} ` +
        `duplicateSkuInDb=${duplicateSkusInDb.length}`,
    );

    if (notFound.length) {
      console.log(`[mark-top] SKUs not found in DB (first 50):`, notFound.slice(0, 50));
    }
    if (duplicateSkusInDb.length) {
      console.log(
        `[mark-top] SKUs matching multiple variants (first 20):`,
        duplicateSkusInDb.slice(0, 20),
      );
    }

    if (!opts.apply) {
      console.log(
        '[mark-top] dry-run sample:',
        JSON.stringify(
          toUpdate.slice(0, 30).map((t) => ({
            sku: t.sku,
            variantId: t.variantId,
            action: 'set is_top=true',
          })),
          null,
          2,
        ),
      );
      console.log('[mark-top] dry-run complete — re-run with --apply to persist');
      return;
    }

    if (!toUpdate.length) {
      console.log(
        '[mark-top] nothing to update — all matched variants already have is_top=true',
      );
      return;
    }

    const chunkSize = 500;
    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
      const batch = toUpdate.slice(i, i + chunkSize);
      const ids = batch.map((t) => t.variantId);
      await variantRepo
        .createQueryBuilder()
        .update(ProductVariantEntity)
        .set({ isTop: true } as Partial<ProductVariantEntity>)
        .whereInIds(ids)
        .execute();
      updated += batch.length;
      console.log(`[mark-top] updated ${updated}/${toUpdate.length}`);
    }

    const uniqueProductIds = [...new Set(toUpdate.map((t) => t.productId))];
    const products = await AppDataSource.query<Array<{ ref_id: string }>>(
      `SELECT ref_id FROM products WHERE id = ANY($1)`,
      [uniqueProductIds],
    );
    const cacheResult = await invalidateProductCache(
      products.map((p) => ({ refId: p.ref_id })),
      false,
    );
    console.log(
      `[mark-top] done updated=${updated} cacheKeysDeleted=${cacheResult.keysDeleted} redis=${cacheResult.connected}`,
    );
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error('[mark-top] failed:', err);
  process.exit(1);
});
