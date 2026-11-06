/**
 * Repair live slugs / product_page_url leaves that incorrectly received a
 * trailing uniqueness `-2` because the parent product's own slug was treated
 * as a global collision (fixed in isSlugTakenGlobally / resolveUniqueVariantSlug).
 *
 * Safe patterns:
 *   product.slug = xyz-face-wash
 *   variant.slug = xyz-face-wash-2   →  xyz-face-wash
 *
 *   product.slug = xyz-face-wash-2   →  xyz-face-wash
 *   only when generateProductSlug(product.name) is xyz-face-wash (stem is the name).
 *
 * NOT repaired (semantic / original URLs):
 *   regaliz-...-pack-of-2  stays  (name already contains "pack of 2")
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:repair-live-variant-slugs
 *   npm run product:repair-live-variant-slugs -- --apply --slug=...
 *
 * Rollback (wrongly stripped pack-of-2 etc.):
 *   npm run product:repair-live-variant-slugs -- --rollback
 *   npm run product:repair-live-variant-slugs -- --rollback --apply
 *   npm run product:repair-live-variant-slugs -- --rollback --from=reports/repair-live-variant-slugs/apply-….json --apply
 *
 * After apply or rollback:
 *   npm run typesense:reindex
 *   npm run cache:invalidate-products
 *   npm run sitemap:generate
 */
import 'reflect-metadata';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ProductStatus } from '../../../../modules/product/enums/product-status.enum';
import { VariantStatus } from '../../../../modules/product/enums/variant-status.enum';
import { invalidateProductCache } from './product-cleanup.redis';
import {
  classifyMinusTwo,
  classifySemanticMinusTwoRestore,
  pathLeaf,
  proposePageUrl,
} from './repair-live-variant-slugs.util';

interface CliOptions {
  apply: boolean;
  rollback: boolean;
  from?: string;
  limit?: number;
  sku?: string;
  productRefId?: string;
  slug?: string;
  help: boolean;
}

type SkipReason =
  | 'not_false_minus_2'
  | 'semantic_name_minus_2'
  | 'clean_slug_empty'
  | 'genuine_collision'
  | 'missing_relationship'
  | 'unchanged';

interface ScanRow {
  variantId: string;
  variantSku: string;
  variantSlug: string;
  variantDisplayName: string | null;
  variantPageUrl: string | null;
  variantSingleUrl: string | null;
  variantStatus: string;
  productId: string;
  productRefId: string;
  productName: string;
  productSlug: string;
  productSingleUrl: string | null;
}

interface CandidateRow {
  variantId: string;
  productId: string;
  productRefId: string;
  productName: string;
  currentProductSlug: string;
  proposedProductSlug: string;
  sku: string;
  variantName: string | null;
  currentSlug: string;
  proposedSlug: string;
  currentPageUrl: string | null;
  proposedPageUrl: string | null;
  currentVariantSingleUrl: string | null;
  proposedVariantSingleUrl: string | null;
  currentProductSingleUrl: string | null;
  proposedProductSingleUrl: string | null;
}

interface SkipRow {
  variantId: string;
  productRefId: string;
  sku: string;
  currentSlug: string;
  proposedSlug: string | null;
  reason: SkipReason;
  detail?: string;
}

interface ChangelogFile {
  generatedAt: string;
  mode: 'repair' | 'rollback';
  rows: CandidateRow[];
}

const changelogDir = (): string => join(process.cwd(), 'reports', 'repair-live-variant-slugs');

const printUsage = (): void => {
  console.log(`
product:repair-live-variant-slugs — Remove false uniqueness -2 (not pack-of-2 names)

  Dry-run:  npm run product:repair-live-variant-slugs
  Apply:    npm run product:repair-live-variant-slugs -- --apply

Rollback wrongly stripped original URLs (name still ends with pack of 2, etc.):
  Dry-run:  npm run product:repair-live-variant-slugs -- --rollback
  Apply:    npm run product:repair-live-variant-slugs -- --rollback --apply
  From log: npm run product:repair-live-variant-slugs -- --rollback --from=<changelog.json> --apply

Options:
  --apply              Persist changes (default: dry-run)
  --rollback           Restore semantic -2 URLs (or reverse a changelog)
  --from <path>        Changelog JSON written on a previous --apply
  --limit <n>          Process at most N eligible repairs
  --sku <value>        Only this exact variant SKU
  --product-ref <id>   Only variants of this product refId
  --slug <value>       Match product slug, variant slug, or page-URL leaf
  --help               Show this help
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { apply: false, rollback: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--rollback') {
      options.rollback = true;
    } else if (arg.startsWith('--from=')) {
      options.from = arg.slice('--from='.length).trim() || undefined;
    } else if (arg === '--from' && next) {
      options.from = next.trim() || undefined;
      index += 1;
    } else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) options.limit = Math.trunc(n);
    } else if (arg === '--limit' && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) options.limit = Math.trunc(n);
      index += 1;
    } else if (arg.startsWith('--sku=')) {
      options.sku = arg.slice('--sku='.length).trim() || undefined;
    } else if (arg === '--sku' && next) {
      options.sku = next.trim() || undefined;
      index += 1;
    } else if (arg.startsWith('--product-ref=')) {
      options.productRefId = arg.slice('--product-ref='.length).trim() || undefined;
    } else if (arg === '--product-ref' && next) {
      options.productRefId = next.trim() || undefined;
      index += 1;
    } else if (arg.startsWith('--slug=')) {
      options.slug = arg.slice('--slug='.length).trim() || undefined;
    } else if (arg === '--slug' && next) {
      options.slug = next.trim() || undefined;
      index += 1;
    }
  }

  return options;
};

const isUniqueViolation = (error: unknown): boolean => {
  const driver =
    error && typeof error === 'object' && 'driverError' in error
      ? (error as { driverError?: { code?: string; constraint?: string } }).driverError
      : (error as { code?: string; constraint?: string } | null);
  return (
    driver?.code === '23505' ||
    `${driver?.constraint ?? ''}`.includes('UQ_product_variants_slug_active')
  );
};

/**
 * Matches UQ_product_variants_slug_active: any non-deleted variant slug, including
 * siblings and unpublished products. Also flags another published product slug.
 */
const isCleanSlugTakenByOtherLiveProduct = async (
  slug: string,
  exclude: { productId: string; variantId: string },
): Promise<{ taken: boolean; detail?: string }> => {
  const variantHit = await AppDataSource.getRepository(ProductVariantEntity)
    .createQueryBuilder('variant')
    .innerJoin('variant.product', 'product')
    .select('variant.id', 'variantId')
    .addSelect('variant.sku', 'sku')
    .addSelect('product.refId', 'productRefId')
    .where('variant.slug = :slug', { slug })
    .andWhere('variant.deletedAt IS NULL')
    .andWhere('variant.id != :variantId', { variantId: exclude.variantId })
    .getRawOne<{ variantId: string; sku: string; productRefId: string }>();

  if (variantHit) {
    return {
      taken: true,
      detail: `active variant sku=${variantHit.sku} on product ${variantHit.productRefId} owns slug "${slug}"`,
    };
  }

  const productHit = await AppDataSource.getRepository(ProductEntity)
    .createQueryBuilder('product')
    .select('product.refId', 'refId')
    .addSelect('product.id', 'id')
    .where('product.slug = :slug', { slug })
    .andWhere('product.deletedAt IS NULL')
    .andWhere('product.status = :published', { published: ProductStatus.PUBLISHED })
    .andWhere('product.id != :productId', { productId: exclude.productId })
    .getRawOne<{ refId: string; id: string }>();

  if (productHit) {
    return {
      taken: true,
      detail: `live product ${productHit.refId} owns slug "${slug}"`,
    };
  }

  return { taken: false };
};

const writeChangelog = (mode: ChangelogFile['mode'], rows: CandidateRow[]): string => {
  mkdirSync(changelogDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(changelogDir(), `${mode}-${stamp}.json`);
  const payload: ChangelogFile = { generatedAt: new Date().toISOString(), mode, rows };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
};

const loadChangelog = (path: string): CandidateRow[] => {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ChangelogFile | CandidateRow[];
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`Invalid changelog: ${path}`);
  }
  return rows.map((row) => ({
    ...row,
    currentProductSlug: row.proposedProductSlug,
    proposedProductSlug: row.currentProductSlug,
    currentSlug: row.proposedSlug,
    proposedSlug: row.currentSlug,
    currentPageUrl: row.proposedPageUrl ?? row.currentPageUrl,
    proposedPageUrl: row.currentPageUrl,
    currentVariantSingleUrl: row.proposedVariantSingleUrl ?? row.currentVariantSingleUrl,
    proposedVariantSingleUrl: row.currentVariantSingleUrl,
    currentProductSingleUrl: row.proposedProductSingleUrl ?? row.currentProductSingleUrl,
    proposedProductSingleUrl: row.currentProductSingleUrl,
  }));
};

const applyFilters = (
  qb: SelectQueryBuilder<ProductVariantEntity>,
  options: CliOptions,
): void => {
  if (options.sku) {
    qb.andWhere('variant.sku = :sku', { sku: options.sku });
  }
  if (options.productRefId) {
    qb.andWhere('product.refId = :productRefId', {
      productRefId: options.productRefId,
    });
  }
  if (options.slug) {
    const slug = options.slug.trim().toLowerCase();
    qb.andWhere(
      `(LOWER(variant.slug) = :slug OR LOWER(product.slug) = :slug
        OR LOWER(COALESCE(variant.product_page_url, '')) LIKE :slugLeaf
        OR LOWER(COALESCE(variant.product_page_url, '')) LIKE :slugLeafSlash
        OR LOWER(COALESCE(variant.single_product_url, '')) LIKE :slugLeaf
        OR LOWER(COALESCE(product.single_product_url, '')) LIKE :slugLeaf)`,
      {
        slug,
        slugLeaf: `%/${slug}`,
        slugLeafSlash: `%/${slug}/`,
      },
    );
  }
};

const scanLiveRows = async (options: CliOptions, forRestore: boolean): Promise<ScanRow[]> => {
  const qb = AppDataSource.getRepository(ProductVariantEntity)
    .createQueryBuilder('variant')
    .innerJoin(ProductEntity, 'product', 'product.id = variant.productId')
    .select('variant.id', 'variantId')
    .addSelect('variant.sku', 'variantSku')
    .addSelect('variant.slug', 'variantSlug')
    .addSelect('variant.displayName', 'variantDisplayName')
    .addSelect('variant.productPageUrl', 'variantPageUrl')
    .addSelect('variant.singleProductUrl', 'variantSingleUrl')
    .addSelect('variant.status', 'variantStatus')
    .addSelect('product.id', 'productId')
    .addSelect('product.refId', 'productRefId')
    .addSelect('product.name', 'productName')
    .addSelect('product.slug', 'productSlug')
    .addSelect('product.singleProductUrl', 'productSingleUrl')
    .where('variant.deletedAt IS NULL')
    .andWhere('product.deletedAt IS NULL')
    .andWhere('product.status = :published', { published: ProductStatus.PUBLISHED })
    .andWhere('variant.status = :active', { active: VariantStatus.ACTIVE })
    .andWhere("variant.slug IS NOT NULL AND TRIM(variant.slug) <> ''")
    .andWhere("product.slug IS NOT NULL AND TRIM(product.slug) <> ''")
    .orderBy('product.refId', 'ASC')
    .addOrderBy('variant.sku', 'ASC');

  if (!forRestore) {
    qb.andWhere(
      `(LOWER(variant.slug) LIKE '%-2' OR LOWER(product.slug) LIKE '%-2'
        OR LOWER(COALESCE(variant.product_page_url, '')) LIKE '%-2'
        OR LOWER(COALESCE(variant.product_page_url, '')) LIKE '%-2/'
        OR LOWER(COALESCE(variant.single_product_url, '')) LIKE '%-2'
        OR LOWER(COALESCE(variant.single_product_url, '')) LIKE '%-2/'
        OR LOWER(COALESCE(product.single_product_url, '')) LIKE '%-2'
        OR LOWER(COALESCE(product.single_product_url, '')) LIKE '%-2/')`,
    );
  }

  applyFilters(qb, options);
  return (await qb.getRawMany()) as ScanRow[];
};

const toCandidate = (
  row: ScanRow,
  proposedProductSlug: string,
  proposedVariantSlug: string,
): CandidateRow | null => {
  const productSlug = String(row.productSlug ?? '').trim();
  const variantSlug = String(row.variantSlug ?? '').trim();
  const pageLeaf = pathLeaf(row.variantPageUrl);
  const oldLeaves = [variantSlug, productSlug, pageLeaf].filter(
    (item): item is string => Boolean(item),
  );
  const proposedPageUrl = proposePageUrl(row.variantPageUrl, oldLeaves, proposedVariantSlug);
  const proposedVariantSingleUrl = proposePageUrl(
    row.variantSingleUrl,
    oldLeaves,
    proposedVariantSlug,
  );
  const proposedProductSingleUrl = proposePageUrl(
    row.productSingleUrl,
    oldLeaves,
    proposedProductSlug,
  );

  const slugChanged =
    proposedProductSlug.toLowerCase() !== productSlug.toLowerCase() ||
    proposedVariantSlug.toLowerCase() !== variantSlug.toLowerCase();
  const urlChanged = Boolean(
    proposedPageUrl || proposedVariantSingleUrl || proposedProductSingleUrl,
  );
  if (!slugChanged && !urlChanged) return null;

  return {
    variantId: row.variantId,
    productId: row.productId,
    productRefId: row.productRefId,
    productName: row.productName,
    currentProductSlug: productSlug,
    proposedProductSlug,
    sku: row.variantSku,
    variantName: row.variantDisplayName,
    currentSlug: variantSlug,
    proposedSlug: proposedVariantSlug,
    currentPageUrl: row.variantPageUrl,
    proposedPageUrl,
    currentVariantSingleUrl: row.variantSingleUrl,
    proposedVariantSingleUrl,
    currentProductSingleUrl: row.productSingleUrl,
    proposedProductSingleUrl,
  };
};

const printPreview = (candidates: CandidateRow[]): void => {
  const preview = candidates.slice(0, 40);
  if (!preview.length) return;
  console.log('\n--- Eligible repairs ---');
  for (const item of preview) {
    console.log(
      `  product=${item.productRefId} | sku=${item.sku}\n` +
        `    name: ${item.productName}` +
        (item.variantName ? ` / ${item.variantName}` : '') +
        `\n    product slug: ${item.currentProductSlug}  →  ${item.proposedProductSlug}` +
        `\n    variant slug: ${item.currentSlug}  →  ${item.proposedSlug}` +
        (item.proposedPageUrl
          ? `\n    page: ${item.currentPageUrl}  →  ${item.proposedPageUrl}`
          : item.currentPageUrl
            ? `\n    page: ${item.currentPageUrl} (leaf unchanged)`
            : '\n    page: (null)'),
    );
  }
  if (candidates.length > preview.length) {
    console.log(`  … ${candidates.length - preview.length} more eligible`);
  }
};

const persistCandidates = async (
  candidates: CandidateRow[],
  stats: { eligible: number; updated: number; skippedCollision: number; errors: number },
): Promise<void> => {
  const updatedProducts = new Set<string>();
  const variantRepo = AppDataSource.getRepository(ProductVariantEntity);
  const productRepo = AppDataSource.getRepository(ProductEntity);
  for (const item of candidates) {
    try {
      const recheckSlug =
        item.proposedSlug.toLowerCase() !== item.currentSlug.toLowerCase()
          ? item.proposedSlug
          : item.proposedProductSlug.toLowerCase() !== item.currentProductSlug.toLowerCase()
            ? item.proposedProductSlug
            : null;
      if (recheckSlug) {
        const recheck = await isCleanSlugTakenByOtherLiveProduct(recheckSlug, {
          productId: item.productId,
          variantId: item.variantId,
        });
        if (recheck.taken) {
          stats.skippedCollision += 1;
          stats.eligible -= 1;
          console.warn(
            `[repair-live-variant-slugs] skip at write time ${item.productRefId} ${item.sku}: ${recheck.detail}`,
          );
          continue;
        }
      }

      if (
        !updatedProducts.has(item.productId) &&
        item.proposedProductSlug.toLowerCase() !== item.currentProductSlug.toLowerCase()
      ) {
        await productRepo.update(
          { id: item.productId },
          {
            slug: item.proposedProductSlug,
            ...(item.proposedProductSingleUrl
              ? { singleProductUrl: item.proposedProductSingleUrl }
              : {}),
          },
        );
        updatedProducts.add(item.productId);
      }

      await variantRepo.update(
        { id: item.variantId },
        {
          ...(item.proposedSlug.toLowerCase() !== item.currentSlug.toLowerCase()
            ? { slug: item.proposedSlug }
            : {}),
          ...(item.proposedPageUrl ? { productPageUrl: item.proposedPageUrl } : {}),
          ...(item.proposedVariantSingleUrl
            ? { singleProductUrl: item.proposedVariantSingleUrl }
            : {}),
        },
      );
      stats.updated += 1;
      console.log(
        `[repair-live-variant-slugs] updated ${item.productRefId} ${item.sku}: ` +
          `product ${item.currentProductSlug} → ${item.proposedProductSlug}; ` +
          `variant ${item.currentSlug} → ${item.proposedSlug}`,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        stats.skippedCollision += 1;
        stats.eligible -= 1;
        console.warn(
          `[repair-live-variant-slugs] skip unique collision ${item.productRefId} ${item.sku}: ` +
            `${item.currentSlug} ↛ ${item.proposedSlug}`,
        );
        continue;
      }
      stats.errors += 1;
      console.error(
        `[repair-live-variant-slugs] skip error ${item.productRefId} ${item.sku}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const cacheTargets = [
    ...new Map(
      candidates.map((c) => [c.productRefId, { refId: c.productRefId, slug: c.proposedSlug }]),
    ).values(),
  ];
  const oldSlugTargets = candidates.flatMap((c) => [
    { refId: c.productRefId, slug: c.currentSlug },
    { refId: c.productRefId, slug: c.currentProductSlug },
  ]);
  const cacheResult = await invalidateProductCache([...cacheTargets, ...oldSlugTargets], false);
  console.log(
    `[repair-live-variant-slugs] redis connected=${cacheResult.connected} keysDeleted=${cacheResult.keysDeleted}`,
  );
};

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  console.log(
    `[repair-live-variant-slugs] mode=${options.rollback ? 'ROLLBACK' : 'REPAIR'} ` +
      `${options.apply ? 'APPLY' : 'DRY-RUN'}` +
      `${options.limit ? ` limit=${options.limit}` : ''}` +
      `${options.sku ? ` sku=${options.sku}` : ''}` +
      `${options.productRefId ? ` productRef=${options.productRefId}` : ''}` +
      `${options.slug ? ` slug=${options.slug}` : ''}` +
      `${options.from ? ` from=${options.from}` : ''}`,
  );

  await AppDataSource.initialize();

  const stats = {
    scanned: 0,
    candidatesMinus2: 0,
    eligible: 0,
    updated: 0,
    skippedCollision: 0,
    skippedInvalid: 0,
    skippedOther: 0,
    errors: 0,
  };

  try {
    const candidates: CandidateRow[] = [];
    const skips: SkipRow[] = [];
    const productStemClaim = new Map<string, string>();
    const claimedVariantSlugs = new Set<string>();

    if (options.rollback && options.from) {
      const reversed = loadChangelog(options.from);
      stats.scanned = reversed.length;
      stats.candidatesMinus2 = reversed.length;
      candidates.push(
        ...(options.limit ? reversed.slice(0, options.limit) : reversed),
      );
    } else {
      const rows = await scanLiveRows(options, Boolean(options.rollback));
      stats.scanned = rows.length;

      for (const row of rows) {
        if (!row.productId || !row.variantId) {
          stats.skippedInvalid += 1;
          skips.push({
            variantId: row.variantId ?? '',
            productRefId: row.productRefId ?? '',
            sku: row.variantSku ?? '',
            currentSlug: row.variantSlug ?? '',
            proposedSlug: null,
            reason: 'missing_relationship',
            detail: 'Missing product or variant id',
          });
          continue;
        }

        const classified = options.rollback
          ? (() => {
              const restore = classifySemanticMinusTwoRestore({
                productName: row.productName,
                currentProductSlug: row.productSlug,
                currentVariantSlug: row.variantSlug,
              });
              return {
                repairProduct: restore.restore,
                repairVariant: restore.restore && restore.restoreVariant,
                proposedProductSlug: restore.restoreSlug,
                proposedVariantSlug: restore.restore
                  ? restore.restoreVariant
                    ? restore.restoreSlug
                    : String(row.variantSlug ?? '').trim()
                  : String(row.variantSlug ?? '').trim(),
                reason: restore.restore ? ('uniqueness_suffix_not_in_name' as const) : ('none' as const),
              };
            })()
          : classifyMinusTwo({
              productName: row.productName,
              productSlug: row.productSlug,
              variantSlug: row.variantSlug,
            });

        if (!classified.repairProduct && !classified.repairVariant) {
          stats.skippedOther += 1;
          skips.push({
            variantId: row.variantId,
            productRefId: row.productRefId,
            sku: row.variantSku,
            currentSlug: String(row.variantSlug ?? '').trim(),
            proposedSlug: null,
            reason:
              classified.reason === 'semantic_name_minus_2'
                ? 'semantic_name_minus_2'
                : 'not_false_minus_2',
            detail: `product=${row.productSlug} reason=${classified.reason}`,
          });
          continue;
        }

        stats.candidatesMinus2 += 1;

        let proposedProductSlug = classified.proposedProductSlug;
        if (classified.repairProduct) {
          const claimed = productStemClaim.get(row.productId);
          if (claimed) {
            proposedProductSlug = claimed;
          } else {
            const collision = await isCleanSlugTakenByOtherLiveProduct(proposedProductSlug, {
              productId: row.productId,
              variantId: row.variantId,
            });
            if (collision.taken) {
              stats.skippedCollision += 1;
              skips.push({
                variantId: row.variantId,
                productRefId: row.productRefId,
                sku: row.variantSku,
                currentSlug: String(row.variantSlug ?? '').trim(),
                proposedSlug: proposedProductSlug,
                reason: 'genuine_collision',
                detail: `product slug ${collision.detail}`,
              });
              continue;
            }
            productStemClaim.set(row.productId, proposedProductSlug);
          }
        }

        const proposedVariantSlug = classified.repairVariant
          ? proposedProductSlug
          : classified.proposedVariantSlug;

        if (!proposedVariantSlug) {
          stats.skippedInvalid += 1;
          skips.push({
            variantId: row.variantId,
            productRefId: row.productRefId,
            sku: row.variantSku,
            currentSlug: String(row.variantSlug ?? '').trim(),
            proposedSlug: null,
            reason: 'clean_slug_empty',
          });
          continue;
        }

        const variantSlug = String(row.variantSlug ?? '').trim();
        if (proposedVariantSlug.toLowerCase() !== variantSlug.toLowerCase()) {
          const claimedKey = proposedVariantSlug.toLowerCase();
          if (claimedVariantSlugs.has(claimedKey)) {
            stats.skippedCollision += 1;
            skips.push({
              variantId: row.variantId,
              productRefId: row.productRefId,
              sku: row.variantSku,
              currentSlug: variantSlug,
              proposedSlug: proposedVariantSlug,
              reason: 'genuine_collision',
              detail: `this run already assigned slug "${proposedVariantSlug}"`,
            });
            continue;
          }
          const collision = await isCleanSlugTakenByOtherLiveProduct(proposedVariantSlug, {
            productId: row.productId,
            variantId: row.variantId,
          });
          if (collision.taken) {
            stats.skippedCollision += 1;
            skips.push({
              variantId: row.variantId,
              productRefId: row.productRefId,
              sku: row.variantSku,
              currentSlug: variantSlug,
              proposedSlug: proposedVariantSlug,
              reason: 'genuine_collision',
              detail: collision.detail,
            });
            continue;
          }
          claimedVariantSlugs.add(claimedKey);
        }

        const candidate = toCandidate(row, proposedProductSlug, proposedVariantSlug);
        if (!candidate) {
          stats.skippedOther += 1;
          skips.push({
            variantId: row.variantId,
            productRefId: row.productRefId,
            sku: row.variantSku,
            currentSlug: variantSlug,
            proposedSlug: proposedVariantSlug,
            reason: 'unchanged',
          });
          continue;
        }

        candidates.push(candidate);
        if (options.limit && candidates.length >= options.limit) break;
      }
    }

    stats.eligible = candidates.length;

    console.log(
      `\n[repair-live-variant-slugs] scanned=${stats.scanned} ` +
        `minus2Candidates=${stats.candidatesMinus2} eligible=${stats.eligible} ` +
        `skippedCollision=${stats.skippedCollision} ` +
        `skippedInvalid=${stats.skippedInvalid} skippedOther=${stats.skippedOther}`,
    );

    printPreview(candidates);

    const collisionSkips = skips.filter((s) => s.reason === 'genuine_collision').slice(0, 20);
    if (collisionSkips.length) {
      console.log('\n--- Skipped (genuine collisions) ---');
      for (const item of collisionSkips) {
        console.log(
          `  product=${item.productRefId} | sku=${item.sku}\n` +
            `    ${item.currentSlug} ↛ ${item.proposedSlug} — ${item.detail ?? item.reason}`,
        );
      }
    }

    const semanticSkips = skips.filter((s) => s.reason === 'semantic_name_minus_2').length;
    if (semanticSkips && !options.rollback) {
      console.log(
        `\n[repair-live-variant-slugs] left ${semanticSkips} semantic -2 URLs unchanged (pack-of-2 / name already ends with -2).`,
      );
    }

    if (!options.apply) {
      if (candidates.length) {
        const previewPath = writeChangelog(options.rollback ? 'rollback' : 'repair', candidates);
        console.log(`[repair-live-variant-slugs] wrote dry-run changelog ${previewPath}`);
      }
      console.log(
        `\n[repair-live-variant-slugs] Dry-run only. Re-run with --apply to persist.\n` +
          (options.rollback
            ? 'Example: npm run product:repair-live-variant-slugs -- --rollback --apply\n'
            : 'Example: npm run product:repair-live-variant-slugs -- --apply --slug=…\n'),
      );
      return;
    }

    if (!candidates.length) {
      console.log('[repair-live-variant-slugs] Nothing to update.');
      return;
    }

    const changelogPath = writeChangelog(options.rollback ? 'rollback' : 'repair', candidates);
    console.log(`[repair-live-variant-slugs] changelog ${changelogPath}`);

    await persistCandidates(candidates, stats);

    console.log(
      '\n[repair-live-variant-slugs] Done. Recommended next:\n' +
        '  npm run typesense:reindex\n' +
        '  npm run cache:invalidate-products\n' +
        '  npm run sitemap:generate\n' +
        '  Then purge the storefront path on the frontend/CDN if www.cureka.com is cached.\n',
    );
  } finally {
    console.log(
      `\n[repair-live-variant-slugs] SUMMARY\n` +
        `  scannedLiveRows:                       ${stats.scanned}\n` +
        `  minus2Candidates:                      ${stats.candidatesMinus2}\n` +
        `  eligibleForRepair:                     ${stats.eligible}\n` +
        `  successfullyUpdated:                   ${stats.updated}\n` +
        `  skippedGenuineCollision:               ${stats.skippedCollision}\n` +
        `  skippedInvalidRelationship:            ${stats.skippedInvalid}\n` +
        `  skippedOther:                          ${stats.skippedOther}\n` +
        `  errors:                                ${stats.errors}\n`,
    );

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error('[repair-live-variant-slugs] failed:', error);
    process.exitCode = 1;
  });
}
