/**
 * Repair live slugs / product_page_url leaves that incorrectly received a
 * trailing `-2` because the parent product's own slug was treated as a global
 * collision (fixed in isSlugTakenGlobally / resolveUniqueVariantSlug).
 *
 * Patterns repaired:
 *   product.slug = xyz-face-wash
 *   variant.slug = xyz-face-wash-2   →  xyz-face-wash
 *
 *   product.slug = xyz-face-wash-2   →  xyz-face-wash  (when stem is free)
 *   variant.slug = xyz-face-wash-2   →  xyz-face-wash
 *   product_page_url leaf …/xyz-face-wash-2 → …/xyz-face-wash
 *
 * Only published products + non-deleted active variants. Clean slug must pass
 * the same live uniqueness rules as isSlugTakenGlobally (parent product and
 * sibling variants of the same product are allowed to share the slug).
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:repair-live-variant-slugs
 *   npm run product:repair-live-variant-slugs -- --slug=pure-nutrition-omega-3-5-6-7-9-1630-mg-30-softgels-2
 *   npm run product:repair-live-variant-slugs -- --apply --slug=pure-nutrition-omega-3-5-6-7-9-1630-mg-30-softgels-2
 *
 * After apply:
 *   npm run typesense:reindex
 *   npm run cache:invalidate-products
 *   npm run sitemap:generate
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
  slug?: string;
  help: boolean;
}

type SkipReason =
  | 'not_false_minus_2'
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

const maxSlugLength = (): number => APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH;

const printUsage = (): void => {
  console.log(`
product:repair-live-variant-slugs — Remove unnecessary -2 from live slugs and page URLs

  Dry-run:  npm run product:repair-live-variant-slugs
  Apply:    npm run product:repair-live-variant-slugs -- --apply

Options:
  --apply              Persist changes (default: dry-run)
  --limit <n>          Process at most N eligible repairs
  --sku <value>        Only this exact variant SKU
  --product-ref <id>   Only variants of this product refId
  --slug <value>       Match product slug, variant slug, or page-URL leaf
  --help               Show this help
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
    } else if (arg.startsWith('--slug=')) {
      options.slug = arg.slice('--slug='.length).trim() || undefined;
    } else if (arg === '--slug' && next) {
      options.slug = next.trim() || undefined;
      index += 1;
    }
  }

  return options;
};

/** Strip a uniqueness suffix `-2` only (not `-12`). */
export const stripTrailingMinusTwo = (slug: string): string | null => {
  const trimmed = String(slug ?? '').trim();
  if (trimmed.length < 3 || !trimmed.toLowerCase().endsWith('-2')) return null;
  const stem = trimmed.slice(0, -2);
  return stem.trim() ? stem : null;
};

const pathLeaf = (value: string | null | undefined): string | null => {
  const raw = value?.trim();
  if (!raw) return null;
  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) path = new URL(raw).pathname;
  } catch {
    // keep path
  }
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
};

/** Rewrite a URL/path leaf when it matches any of the old slugs. */
const proposePageUrl = (
  pageUrl: string | null | undefined,
  oldLeaves: string[],
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
  const old = new Set(oldLeaves.map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!old.has(leaf.toLowerCase())) return null;

  parts[parts.length - 1] = proposedSlug.slice(0, maxSlugLength());
  const rebuiltPath = `/${parts.join('/')}${trailingSlash ? '/' : ''}`;
  return origin ? `${origin}${rebuiltPath}` : rebuiltPath;
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
      `${options.productRefId ? ` productRef=${options.productRefId}` : ''}` +
      `${options.slug ? ` slug=${options.slug}` : ''}`,
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
      .andWhere(
        `(LOWER(variant.slug) LIKE '%-2' OR LOWER(product.slug) LIKE '%-2'
          OR LOWER(COALESCE(variant.product_page_url, '')) LIKE '%-2'
          OR LOWER(COALESCE(variant.product_page_url, '')) LIKE '%-2/'
          OR LOWER(COALESCE(variant.single_product_url, '')) LIKE '%-2'
          OR LOWER(COALESCE(variant.single_product_url, '')) LIKE '%-2/'
          OR LOWER(COALESCE(product.single_product_url, '')) LIKE '%-2'
          OR LOWER(COALESCE(product.single_product_url, '')) LIKE '%-2/')`,
      )
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

    const rows = (await qb.getRawMany()) as ScanRow[];
    stats.scanned = rows.length;

    const candidates: CandidateRow[] = [];
    const skips: SkipRow[] = [];
    const productStemClaim = new Map<string, string>();
    const claimedVariantSlugs = new Set<string>();

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

      const productSlug = String(row.productSlug ?? '').trim();
      const variantSlug = String(row.variantSlug ?? '').trim();
      const productStem = stripTrailingMinusTwo(productSlug);
      const variantStem = stripTrailingMinusTwo(variantSlug);
      const pageLeaf = pathLeaf(row.variantPageUrl);
      const pageStem = pageLeaf ? stripTrailingMinusTwo(pageLeaf) : null;

      const looksLikeFalseMinusTwo = Boolean(
        (variantStem && variantStem.toLowerCase() === productSlug.toLowerCase()) ||
          productStem ||
          (pageStem &&
            (pageLeaf?.toLowerCase() === variantSlug.toLowerCase() ||
              pageLeaf?.toLowerCase() === productSlug.toLowerCase() ||
              pageStem.toLowerCase() === productSlug.toLowerCase() ||
              pageStem.toLowerCase() === variantStem?.toLowerCase())),
      );

      if (!looksLikeFalseMinusTwo) {
        stats.skippedOther += 1;
        skips.push({
          variantId: row.variantId,
          productRefId: row.productRefId,
          sku: row.variantSku,
          currentSlug: variantSlug,
          proposedSlug: null,
          reason: 'not_false_minus_2',
          detail: `product=${productSlug} pageLeaf=${pageLeaf ?? '(none)'}`,
        });
        continue;
      }

      stats.candidatesMinus2 += 1;

      let proposedProductSlug = productSlug;
      if (productStem) {
        const claimed = productStemClaim.get(row.productId);
        if (claimed) {
          proposedProductSlug = claimed;
        } else {
          const collision = await isCleanSlugTakenByOtherLiveProduct(productStem, {
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
              proposedSlug: productStem,
              reason: 'genuine_collision',
              detail: `product slug ${collision.detail}`,
            });
            continue;
          }
          proposedProductSlug = productStem.slice(0, maxSlugLength());
          productStemClaim.set(row.productId, proposedProductSlug);
        }
      }

      let proposedVariantSlug = variantSlug;
      if (
        variantStem &&
        (variantStem.toLowerCase() === productSlug.toLowerCase() ||
          variantStem.toLowerCase() === proposedProductSlug.toLowerCase() ||
          variantSlug.toLowerCase() === productSlug.toLowerCase())
      ) {
        proposedVariantSlug = proposedProductSlug;
      } else if (variantSlug.toLowerCase() === `${productSlug.toLowerCase()}-2`) {
        proposedVariantSlug = proposedProductSlug;
      } else if (
        variantSlug.toLowerCase() === productSlug.toLowerCase() &&
        proposedProductSlug.toLowerCase() !== productSlug.toLowerCase()
      ) {
        proposedVariantSlug = proposedProductSlug;
      }

      proposedVariantSlug = proposedVariantSlug.slice(0, maxSlugLength());
      if (!proposedVariantSlug) {
        stats.skippedInvalid += 1;
        skips.push({
          variantId: row.variantId,
          productRefId: row.productRefId,
          sku: row.variantSku,
          currentSlug: variantSlug,
          proposedSlug: null,
          reason: 'clean_slug_empty',
        });
        continue;
      }

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

      const oldLeaves = [variantSlug, productSlug, pageLeaf].filter(
        (item): item is string => Boolean(item),
      );
      const proposedPageUrl = proposePageUrl(
        row.variantPageUrl,
        oldLeaves,
        proposedVariantSlug,
      );
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

      if (!slugChanged && !urlChanged) {
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

      candidates.push({
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
      });

      if (options.limit && candidates.length >= options.limit) break;
    }

    stats.eligible = candidates.length;

    console.log(
      `\n[repair-live-variant-slugs] scanned=${stats.scanned} ` +
        `minus2Candidates=${stats.candidatesMinus2} eligible=${stats.eligible} ` +
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
          'Example: npm run product:repair-live-variant-slugs -- --apply --slug=pure-nutrition-omega-3-5-6-7-9-1630-mg-30-softgels-2\n',
      );
      return;
    }

    if (!candidates.length) {
      console.log('[repair-live-variant-slugs] Nothing to update.');
      return;
    }

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
          `[repair-live-variant-slugs] error updating ${item.productRefId} ${item.sku}:`,
          error instanceof Error ? error.message : error,
        );
        throw error;
      }
    }

    const cacheTargets = [
      ...new Map(
        candidates.map((c) => [
          c.productRefId,
          { refId: c.productRefId, slug: c.proposedSlug },
        ]),
      ).values(),
    ];
    const oldSlugTargets = candidates.flatMap((c) => [
      { refId: c.productRefId, slug: c.currentSlug },
      { refId: c.productRefId, slug: c.currentProductSlug },
    ]);
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
