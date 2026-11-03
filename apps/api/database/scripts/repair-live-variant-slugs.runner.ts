/**
 * Repair live variant slugs that incorrectly received a trailing `-2` because
 * the parent product's own slug was treated as a global collision (fixed in
 * isSlugTakenGlobally / resolveUniqueVariantSlug).
 *
 * Pattern repaired:
 *   product.slug = xyz-face-wash
 *   variant.slug = xyz-face-wash-2   →  xyz-face-wash
 *
 * Only published products + non-deleted active variants. Clean slug must pass
 * the same live uniqueness rules as isSlugTakenGlobally (parent product and
 * sibling variants of the same product are allowed to share the slug).
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:repair-live-variant-slugs
 *   npm run product:repair-live-variant-slugs -- --limit=20
 *   npm run product:repair-live-variant-slugs -- --sku=ABC123
 *   npm run product:repair-live-variant-slugs -- --apply
 *   npm run product:repair-live-variant-slugs -- --apply --limit=50
 *
 * After apply on an environment that serves search/cache:
 *   npm run typesense:reindex
 *   npm run cache:invalidate-products
 *   npm run sitemap:generate   # if locs use variant slug / product_page_url
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ProductStatus } from '../../../../modules/product/enums/product-status.enum';
import { VariantStatus } from '../../../../modules/product/enums/variant-status.enum';
import { APP_CONSTANTS } from '../../../../packages/common/src/app.constants';
import { invalidateProductCache } from './product-cleanup.redis';

interface CliOptions {
  apply: boolean;
  limit?: number;
  sku?: string;
  productRefId?: string;
  help: boolean;
}

type SkipReason =
  | 'not_parent_slug_minus_2'
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
  variantStatus: string;
  productId: string;
  productRefId: string;
  productName: string;
  productSlug: string;
}

interface CandidateRow {
  variantId: string;
  productId: string;
  productRefId: string;
  productName: string;
  productSlug: string;
  sku: string;
  variantName: string | null;
  currentSlug: string;
  proposedSlug: string;
  currentPageUrl: string | null;
  proposedPageUrl: string | null;
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

const maxSlugLength = (): number => APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH;

const printUsage = (): void => {
  console.log(`
product:repair-live-variant-slugs — Remove unnecessary -2 from live variant slugs

  Dry-run:  npm run product:repair-live-variant-slugs
  Apply:    npm run product:repair-live-variant-slugs -- --apply

Options:
  --apply              Persist changes (default: dry-run)
  --limit <n>          Process at most N eligible repairs
  --sku <value>        Only this exact variant SKU
  --product-ref <id>   Only variants of this product refId
  --help               Show this help

Eligibility:
  - Product status = published, not soft-deleted
  - Variant status = active, not soft-deleted
  - variant.slug === "{product.slug}-2" (case-insensitive)
  - Clean slug available under live uniqueness rules
    (parent product + sibling variants of same product may share the slug)
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { apply: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--apply') {
      options.apply = true;
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
    }
  }

  return options;
};

/** True when variant.slug is exactly "{productSlug}-2". */
const isParentSlugMinusTwo = (variantSlug: string, productSlug: string): boolean => {
  const variant = String(variantSlug ?? '').trim().toLowerCase();
  const product = String(productSlug ?? '').trim().toLowerCase();
  if (!variant || !product) return false;
  return variant === `${product}-2`;
};

/**
 * Matches products.repository.isSlugTakenGlobally for published rows, excluding
 * this product id and this variant id (parent + siblings may share the slug).
 */
const isCleanSlugTakenByOtherLiveProduct = async (
  slug: string,
  exclude: { productId: string; variantId: string },
): Promise<{ taken: boolean; detail?: string }> => {
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

  const variantHit = await AppDataSource.getRepository(ProductVariantEntity)
    .createQueryBuilder('variant')
    .innerJoin('variant.product', 'product')
    .select('variant.id', 'variantId')
    .addSelect('variant.sku', 'sku')
    .addSelect('product.refId', 'productRefId')
    .where('variant.slug = :slug', { slug })
    .andWhere('variant.deletedAt IS NULL')
    .andWhere('product.deletedAt IS NULL')
    .andWhere('product.status = :published', { published: ProductStatus.PUBLISHED })
    .andWhere('variant.id != :variantId', { variantId: exclude.variantId })
    .andWhere('product.id != :productId', { productId: exclude.productId })
    .getRawOne<{ variantId: string; sku: string; productRefId: string }>();

  if (variantHit) {
    return {
      taken: true,
      detail: `live variant sku=${variantHit.sku} on product ${variantHit.productRefId} owns slug "${slug}"`,
    };
  }

  return { taken: false };
};

/** Rewrite product_page_url leaf when it equals the current variant slug. */
const proposePageUrl = (
  pageUrl: string | null | undefined,
  currentSlug: string,
  proposedSlug: string,
): string | null => {
  const raw = pageUrl?.trim();
  if (!raw) return null;

  const trailingSlash = raw.endsWith('/');
  let path = raw;
  let origin = '';
  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      path = parsed.pathname;
      origin = `${parsed.origin}`;
    }
  } catch {
    // keep path as-is
  }
  if (!path.startsWith('/')) path = `/${path}`;

  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  if (!parts.length) return null;

  const leaf = parts[parts.length - 1];
  if (leaf.toLowerCase() !== currentSlug.toLowerCase()) {
    // Leaf does not mirror variant.slug — leave URL alone.
    return null;
  }

  parts[parts.length - 1] = proposedSlug.slice(0, maxSlugLength());
  const rebuiltPath = `/${parts.join('/')}${trailingSlash ? '/' : ''}`;
  return origin ? `${origin}${rebuiltPath}` : rebuiltPath;
};

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  console.log(
    `[repair-live-variant-slugs] mode=${options.apply ? 'APPLY' : 'DRY-RUN'}` +
      `${options.limit ? ` limit=${options.limit}` : ''}` +
      `${options.sku ? ` sku=${options.sku}` : ''}` +
      `${options.productRefId ? ` productRef=${options.productRefId}` : ''}`,
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
    const qb = AppDataSource.getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoin(ProductEntity, 'product', 'product.id = variant.productId')
      .select('variant.id', 'variantId')
      .addSelect('variant.sku', 'variantSku')
      .addSelect('variant.slug', 'variantSlug')
      .addSelect('variant.displayName', 'variantDisplayName')
      .addSelect('variant.productPageUrl', 'variantPageUrl')
      .addSelect('variant.status', 'variantStatus')
      .addSelect('product.id', 'productId')
      .addSelect('product.refId', 'productRefId')
      .addSelect('product.name', 'productName')
      .addSelect('product.slug', 'productSlug')
      .where('variant.deletedAt IS NULL')
      .andWhere('product.deletedAt IS NULL')
      .andWhere('product.status = :published', { published: ProductStatus.PUBLISHED })
      .andWhere('variant.status = :active', { active: VariantStatus.ACTIVE })
      .andWhere("variant.slug IS NOT NULL AND TRIM(variant.slug) <> ''")
      .andWhere("product.slug IS NOT NULL AND TRIM(product.slug) <> ''")
      // Cheap SQL prefilter: ends with -2
      .andWhere(`LOWER(variant.slug) LIKE '%-2'`)
      .orderBy('product.refId', 'ASC')
      .addOrderBy('variant.sku', 'ASC');

    if (options.sku) {
      qb.andWhere('variant.sku = :sku', { sku: options.sku });
    }
    if (options.productRefId) {
      qb.andWhere('product.refId = :productRefId', {
        productRefId: options.productRefId,
      });
    }

    const rows = (await qb.getRawMany()) as ScanRow[];
    stats.scanned = rows.length;

    const reservedCleanSlugs = new Set<string>();
    const candidates: CandidateRow[] = [];
    const skips: SkipRow[] = [];

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

      if (!isParentSlugMinusTwo(row.variantSlug, row.productSlug)) {
        stats.skippedOther += 1;
        skips.push({
          variantId: row.variantId,
          productRefId: row.productRefId,
          sku: row.variantSku,
          currentSlug: row.variantSlug,
          proposedSlug: null,
          reason: 'not_parent_slug_minus_2',
          detail: `Expected "${row.productSlug}-2"`,
        });
        continue;
      }

      stats.candidatesMinus2 += 1;
      const proposedSlug = String(row.productSlug).trim().slice(0, maxSlugLength());
      if (!proposedSlug) {
        stats.skippedInvalid += 1;
        skips.push({
          variantId: row.variantId,
          productRefId: row.productRefId,
          sku: row.variantSku,
          currentSlug: row.variantSlug,
          proposedSlug: null,
          reason: 'clean_slug_empty',
        });
        continue;
      }

      if (proposedSlug.toLowerCase() === row.variantSlug.trim().toLowerCase()) {
        stats.skippedOther += 1;
        skips.push({
          variantId: row.variantId,
          productRefId: row.productRefId,
          sku: row.variantSku,
          currentSlug: row.variantSlug,
          proposedSlug,
          reason: 'unchanged',
        });
        continue;
      }

      const collision = await isCleanSlugTakenByOtherLiveProduct(proposedSlug, {
        productId: row.productId,
        variantId: row.variantId,
      });
      if (collision.taken) {
        stats.skippedCollision += 1;
        skips.push({
          variantId: row.variantId,
          productRefId: row.productRefId,
          sku: row.variantSku,
          currentSlug: row.variantSlug,
          proposedSlug,
          reason: 'genuine_collision',
          detail: collision.detail,
        });
        continue;
      }

      // Track claimed clean slugs for logging; same-product siblings may share.
      reservedCleanSlugs.add(`${row.productId}:${proposedSlug.toLowerCase()}`);
      candidates.push({
        variantId: row.variantId,
        productId: row.productId,
        productRefId: row.productRefId,
        productName: row.productName,
        productSlug: row.productSlug,
        sku: row.variantSku,
        variantName: row.variantDisplayName,
        currentSlug: row.variantSlug,
        proposedSlug,
        currentPageUrl: row.variantPageUrl,
        proposedPageUrl: proposePageUrl(
          row.variantPageUrl,
          row.variantSlug,
          proposedSlug,
        ),
      });

      if (options.limit && candidates.length >= options.limit) break;
    }

    stats.eligible = candidates.length;

    console.log(
      `\n[repair-live-variant-slugs] scanned=${stats.scanned} ` +
        `parentMinus2Candidates=${stats.candidatesMinus2} eligible=${stats.eligible} ` +
        `skippedCollision=${stats.skippedCollision} ` +
        `skippedInvalid=${stats.skippedInvalid} skippedOther=${stats.skippedOther}`,
    );

    const preview = candidates.slice(0, 40);
    if (preview.length) {
      console.log('\n--- Eligible repairs ---');
      for (const item of preview) {
        console.log(
          `  product=${item.productRefId} | sku=${item.sku}\n` +
            `    name: ${item.productName}` +
            (item.variantName ? ` / ${item.variantName}` : '') +
            `\n    slug: ${item.currentSlug}  →  ${item.proposedSlug}` +
            (item.proposedPageUrl
              ? `\n    page: ${item.currentPageUrl}  →  ${item.proposedPageUrl}`
              : item.currentPageUrl
                ? `\n    page: ${item.currentPageUrl} (leaf unchanged / not matching slug)`
                : '\n    page: (null)'),
        );
      }
      if (candidates.length > preview.length) {
        console.log(`  … ${candidates.length - preview.length} more eligible`);
      }
    }

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

    if (!options.apply) {
      console.log(
        '\n[repair-live-variant-slugs] Dry-run only. Re-run with --apply to persist.\n' +
          'Example: npm run product:repair-live-variant-slugs -- --apply\n',
      );
      return;
    }

    if (!candidates.length) {
      console.log('[repair-live-variant-slugs] Nothing to update.');
      return;
    }

    await AppDataSource.transaction(async (manager) => {
      for (const item of candidates) {
        try {
          // Re-validate immediately before write (concurrent publish safety).
          const recheck = await isCleanSlugTakenByOtherLiveProduct(item.proposedSlug, {
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

          await manager.getRepository(ProductVariantEntity).update(
            { id: item.variantId },
            {
              slug: item.proposedSlug,
              ...(item.proposedPageUrl
                ? { productPageUrl: item.proposedPageUrl }
                : {}),
            },
          );
          stats.updated += 1;
          console.log(
            `[repair-live-variant-slugs] updated ${item.productRefId} ${item.sku}: ` +
              `${item.currentSlug} → ${item.proposedSlug}`,
          );
        } catch (error) {
          stats.errors += 1;
          console.error(
            `[repair-live-variant-slugs] error updating ${item.productRefId} ${item.sku}:`,
            error instanceof Error ? error.message : error,
          );
          throw error;
        }
      }
    });

    const cacheTargets = [
      ...new Map(
        candidates.map((c) => [
          c.productRefId,
          { refId: c.productRefId, slug: c.proposedSlug },
        ]),
      ).values(),
    ];
    // Also invalidate old -2 public detail keys when slug was the cache key.
    const oldSlugTargets = candidates.map((c) => ({
      refId: c.productRefId,
      slug: c.currentSlug,
    }));
    const cacheResult = await invalidateProductCache(
      [...cacheTargets, ...oldSlugTargets],
      false,
    );
    console.log(
      `[repair-live-variant-slugs] redis connected=${cacheResult.connected} keysDeleted=${cacheResult.keysDeleted}`,
    );

    console.log(
      '\n[repair-live-variant-slugs] Done. Recommended next:\n' +
        '  npm run typesense:reindex\n' +
        '  npm run cache:invalidate-products\n' +
        '  npm run sitemap:generate\n',
    );
  } finally {
    console.log(
      `\n[repair-live-variant-slugs] SUMMARY\n` +
        `  scannedLiveVariantsEndingMinus2Filter: ${stats.scanned}\n` +
        `  parentSlugMinus2Candidates:            ${stats.candidatesMinus2}\n` +
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

main().catch((error: unknown) => {
  console.error('[repair-live-variant-slugs] failed:', error);
  process.exitCode = 1;
});
