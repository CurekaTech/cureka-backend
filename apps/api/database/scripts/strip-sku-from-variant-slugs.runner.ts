/**
 * Strip legacy SKU suffixes from product_variants.slug (and matching product_page_url leaf).
 *
 * Background:
 *   Migration AddProductVariantSlug1780820000000 set
 *     variant.slug = `{productSlug}-{slugify(sku)}`
 *   for simple variants with no attribute values.
 *   Current create path never appends SKU. Old rows still have it, so storefront
 *   permalinks fall back to `/shop/.../{variant.slug}` and expose the SKU.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run product:strip-sku-from-variant-slugs
 *   npm run product:strip-sku-from-variant-slugs -- --limit=20
 *   npm run product:strip-sku-from-variant-slugs -- --apply
 *   npm run product:strip-sku-from-variant-slugs -- --apply --limit=50
 *   npm run product:strip-sku-from-variant-slugs -- --sku=SKI/MES/18441 --apply
 *
 * After apply on production, also run:
 *   npm run typesense:reindex
 *   npm run cache:invalidate-products
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { generateProductSlug } from '../../../../modules/product/utils/product-slug.util';
import { APP_CONSTANTS } from '../../../../packages/common/src/app.constants';
import { invalidateProductCache } from './product-cleanup.redis';

interface CliOptions {
  apply: boolean;
  limit?: number;
  sku?: string;
  help: boolean;
}

interface CandidateRow {
  variantId: string;
  productId: string;
  productRefId: string;
  productName: string;
  productSlug: string;
  sku: string;
  currentSlug: string;
  proposedSlug: string;
  currentPageUrl: string | null;
  proposedPageUrl: string | null;
}

const maxSlugLength = (): number => APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH;

const printUsage = (): void => {
  console.log(`
product:strip-sku-from-variant-slugs — Remove legacy -{sku} suffix from variant.slug

  Dry-run:  npm run product:strip-sku-from-variant-slugs
  Apply:    npm run product:strip-sku-from-variant-slugs -- --apply

Options:
  --apply         Persist changes (default: dry-run)
  --limit <n>     Process at most N variants
  --sku <value>   Only variants with this exact SKU (e.g. SKI/MES/18441)
  --help          Show this help
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
    }
  }

  return options;
};

/** Same slugify used for new product/variant slugs (SKI/MES/18441 → skimes18441). */
const slugifySku = (sku: string): string => generateProductSlug(sku);

/**
 * If variant.slug ends with -{slugifiedSku}, return the slug with that suffix removed.
 * Also accepts an optional numeric uniqueness counter after the SKU (-2, -3, …).
 */
const stripSkuSuffixFromSlug = (slug: string, sku: string): string | null => {
  const current = String(slug ?? '').trim().toLowerCase();
  const skuSlug = slugifySku(sku);
  if (!current || !skuSlug) return null;

  const escaped = skuSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = current.match(new RegExp(`^(.*?)-${escaped}(?:-(\\d+))?$`, 'i'));
  if (!match?.[1]) return null;

  const base = match[1].replace(/-+$/g, '');
  if (!base || base === current) return null;
  return base.slice(0, maxSlugLength());
};

/** Rewrite product_page_url leaf when it carries the same SKU suffix. */
const proposePageUrl = (
  pageUrl: string | null | undefined,
  currentSlug: string,
  proposedSlug: string,
): string | null => {
  const raw = pageUrl?.trim();
  if (!raw) return null;

  const trailingSlash = raw.endsWith('/');
  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) path = new URL(raw).pathname;
  } catch {
    // keep
  }
  if (!path.startsWith('/')) path = `/${path}`;

  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  if (!parts.length) return null;

  const leaf = parts[parts.length - 1];
  const leafLower = leaf.toLowerCase();
  const currentLower = currentSlug.toLowerCase();
  const proposedLower = proposedSlug.toLowerCase();

  let nextLeaf: string | null = null;
  if (leafLower === currentLower) {
    nextLeaf = proposedSlug;
  } else if (currentLower.startsWith(`${proposedLower}-`)) {
    const removed = currentLower.slice(proposedLower.length); // "-skimes18441" or "-skimes18441-2"
    if (leafLower.endsWith(removed)) {
      nextLeaf = leaf.slice(0, leaf.length - removed.length) || proposedSlug;
    }
  }

  if (!nextLeaf || nextLeaf.toLowerCase() === leafLower) return null;

  parts[parts.length - 1] = nextLeaf.slice(0, maxSlugLength());
  const rebuilt = `/${parts.join('/')}`;
  return trailingSlash ? `${rebuilt}/` : rebuilt;
};

const allocateUniqueSlug = async (
  desired: string,
  excludeVariantId: string,
  parentProductId: string,
  reserved: Set<string>,
): Promise<string> => {
  const max = maxSlugLength();
  const base = desired.slice(0, max);

  const isTaken = async (slug: string): Promise<boolean> => {
    if (reserved.has(slug)) return true;

    const variantCount = await AppDataSource.getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .where('variant.slug = :slug', { slug })
      .andWhere('variant.deletedAt IS NULL')
      .andWhere('variant.id != :excludeVariantId', { excludeVariantId })
      .getCount();
    if (variantCount > 0) return true;

    // Allow same slug as THIS product (simple products). Block other products.
    const productCount = await AppDataSource.getRepository(ProductEntity)
      .createQueryBuilder('product')
      .where('product.slug = :slug', { slug })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('product.id != :parentProductId', { parentProductId })
      .getCount();
    return productCount > 0;
  };

  if (!(await isTaken(base))) return base;

  let counter = 2;
  let candidate = `${base.slice(0, Math.max(1, max - 3))}-${counter}`.slice(0, max);
  while (await isTaken(candidate)) {
    counter += 1;
    candidate = `${base.slice(0, Math.max(1, max - String(counter).length - 1))}-${counter}`.slice(
      0,
      max,
    );
  }
  return candidate;
};

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  console.log(
    `[strip-sku-slugs] mode=${options.apply ? 'APPLY' : 'DRY-RUN'}` +
      `${options.limit ? ` limit=${options.limit}` : ''}` +
      `${options.sku ? ` sku=${options.sku}` : ''}`,
  );

  await AppDataSource.initialize();

  try {
    const qb = AppDataSource.getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoin(ProductEntity, 'product', 'product.id = variant.productId')
      .select('variant.id', 'variantId')
      .addSelect('variant.sku', 'sku')
      .addSelect('variant.slug', 'currentSlug')
      .addSelect('variant.productPageUrl', 'currentPageUrl')
      .addSelect('product.id', 'productId')
      .addSelect('product.refId', 'productRefId')
      .addSelect('product.name', 'productName')
      .addSelect('product.slug', 'productSlug')
      .where('variant.deletedAt IS NULL')
      .andWhere('product.deletedAt IS NULL')
      .andWhere("variant.sku IS NOT NULL AND TRIM(variant.sku) <> ''")
      .andWhere("variant.slug IS NOT NULL AND TRIM(variant.slug) <> ''")
      // Cheap SQL prefilter: slug ends with -{slugifiedSku} or -{slugifiedSku}-{n}
      .andWhere(
        `LOWER(variant.slug) ~ (
          '-' || REGEXP_REPLACE(LOWER(variant.sku), '[^a-z0-9]+', '', 'g') || '(-[0-9]+)?$'
        )`,
      )
      .orderBy('product.refId', 'ASC')
      .addOrderBy('variant.sku', 'ASC');

    if (options.sku) {
      qb.andWhere('variant.sku = :sku', { sku: options.sku });
    }

    const rows = (await qb.getRawMany());

    const reserved = new Set<string>();
    const candidates: CandidateRow[] = [];
    let skippedNoSuffix = 0;
    let skippedUnchanged = 0;

    for (const row of rows) {
      const stripped = stripSkuSuffixFromSlug(row.currentSlug, row.sku);
      if (!stripped) {
        skippedNoSuffix += 1;
        continue;
      }

      const proposedSlug = await allocateUniqueSlug(
        stripped,
        row.variantId,
        row.productId,
        reserved,
      );

      if (proposedSlug.toLowerCase() === row.currentSlug.toLowerCase()) {
        skippedUnchanged += 1;
        continue;
      }

      reserved.add(proposedSlug);

      candidates.push({
        variantId: row.variantId,
        productId: row.productId,
        productRefId: row.productRefId,
        productName: row.productName,
        productSlug: row.productSlug,
        sku: row.sku,
        currentSlug: row.currentSlug,
        proposedSlug,
        currentPageUrl: row.currentPageUrl,
        proposedPageUrl: proposePageUrl(row.currentPageUrl, row.currentSlug, proposedSlug),
      });

      if (options.limit && candidates.length >= options.limit) break;
    }

    console.log(
      `[strip-sku-slugs] scanned=${rows.length} candidates=${candidates.length} ` +
        `skippedNoSkuSuffix=${skippedNoSuffix} skippedUnchanged=${skippedUnchanged}`,
    );

    const preview = candidates.slice(0, 25);
    for (const item of preview) {
      console.log(
        `  ${item.productRefId} | ${item.sku}\n` +
          `    slug: ${item.currentSlug}  →  ${item.proposedSlug}` +
          (item.proposedPageUrl
            ? `\n    page: ${item.currentPageUrl}  →  ${item.proposedPageUrl}`
            : item.currentPageUrl
              ? `\n    page: ${item.currentPageUrl} (unchanged)`
              : ''),
      );
    }
    if (candidates.length > preview.length) {
      console.log(`  … ${candidates.length - preview.length} more`);
    }

    if (!options.apply) {
      console.log(
        '\n[strip-sku-slugs] Dry-run only. Re-run with --apply to persist.\n' +
          'Example: npm run product:strip-sku-from-variant-slugs -- --apply',
      );
      return;
    }

    if (!candidates.length) {
      console.log('[strip-sku-slugs] Nothing to update.');
      return;
    }

    let updated = 0;
    await AppDataSource.transaction(async (manager) => {
      for (const item of candidates) {
        await manager.getRepository(ProductVariantEntity).update(
          { id: item.variantId },
          {
            slug: item.proposedSlug,
            ...(item.proposedPageUrl ? { productPageUrl: item.proposedPageUrl } : {}),
          },
        );
        updated += 1;
      }
    });

    console.log(`[strip-sku-slugs] updated=${updated}`);

    const cacheTargets = [
      ...new Map(
        candidates.map((c) => [c.productRefId, { refId: c.productRefId, slug: c.productSlug }]),
      ).values(),
    ];
    const cacheResult = await invalidateProductCache(cacheTargets, false);
    console.log(
      `[strip-sku-slugs] redis connected=${cacheResult.connected} keysDeleted=${cacheResult.keysDeleted}`,
    );

    console.log(
      '\n[strip-sku-slugs] Done. Recommended next:\n' +
        '  npm run typesense:reindex\n' +
        '  (sitemap regenerate if product locs use variant slug / page URL)',
    );
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

main().catch((error: unknown) => {
  console.error('[strip-sku-slugs] failed:', error);
  process.exitCode = 1;
});
