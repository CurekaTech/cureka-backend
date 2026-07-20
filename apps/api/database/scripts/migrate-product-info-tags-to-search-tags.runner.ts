/**
 * Migrates product_information "Tags" entries into variant search_tags,
 * then removes that Tags item from product_information.
 *
 * Tags description may be comma-separated and/or pipe-separated, e.g.:
 *   "paracetamol, fever|dolo"
 *
 * Product-level Tags are copied onto every non-deleted variant of that product
 * (merged/deduped with any existing search_tags).
 *
 * Dry-run (default):
 *   npm run product:migrate-search-tags
 *
 * Apply:
 *   npm run product:migrate-search-tags -- --apply
 *
 * Options:
 *   --apply              Persist changes (without this flag, dry-run only)
 *   --batch-size <n>     Products per batch (default: 200)
 *   --ref-ids <ids>      Limit to specific product refIds (comma/space separated)
 *   --deactivate-label   Also soft-delete/inactivate product_information_labels named "Tags"
 */
import 'reflect-metadata';
import { In, IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ProductVariantEntity } from '../../../../modules/product/entities/product-variant.entity';
import { ProductInformationLabelEntity } from '../../../../modules/product/entities/product-information-label.entity';
import { IProductInformationItem } from '../../../../modules/product/interfaces/product-information.interface';
import { MasterStatus } from '../../../../modules/master/enums/master-status.enum';
import { invalidateProductCache } from './product-cleanup.redis';

const DEFAULT_BATCH_SIZE = 200;
const TAGS_LABEL = 'tags';

interface CliOptions {
  apply: boolean;
  batchSize: number;
  refIds: string[];
  deactivateLabel: boolean;
}

interface MigrationStats {
  productsScanned: number;
  productsWithTags: number;
  productsUpdated: number;
  variantsUpdated: number;
  tagsMigrated: number;
  productsSkippedNoVariants: number;
  labelsDeactivated: number;
}

const printUsage = (): void => {
  console.log(`
Migrate product_information "Tags" → variant search_tags

Examples:
  npm run product:migrate-search-tags
  npm run product:migrate-search-tags -- --apply
  npm run product:migrate-search-tags -- --ref-ids=SUN20261234,SUN20264567 --apply
  npm run product:migrate-search-tags -- --apply --deactivate-label

Options:
  --apply              Persist DB changes (default is dry-run)
  --batch-size <n>     Products per batch (default: ${DEFAULT_BATCH_SIZE})
  --ref-ids <ids>      Limit to specific product refIds
  --deactivate-label   Soft-delete/inactivate product_information_labels named "Tags"
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
    refIds: [],
    deactivateLabel: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--deactivate-label') {
      options.deactivateLabel = true;
      continue;
    }

    if (arg.startsWith('--batch-size=')) {
      options.batchSize = Math.max(1, Number(arg.slice('--batch-size='.length)) || DEFAULT_BATCH_SIZE);
      continue;
    }

    if (arg === '--batch-size' && next) {
      options.batchSize = Math.max(1, Number(next) || DEFAULT_BATCH_SIZE);
      index += 1;
      continue;
    }

    if (arg.startsWith('--ref-ids=')) {
      options.refIds.push(
        ...arg
          .slice('--ref-ids='.length)
          .split(/[,\s]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      );
      continue;
    }

    if (arg === '--ref-ids') {
      while (index + 1 < argv.length && !argv[index + 1]!.startsWith('--')) {
        index += 1;
        options.refIds.push(
          ...argv[index]!
            .split(/[,\s]+/)
            .map((value) => value.trim())
            .filter(Boolean),
        );
      }
    }
  }

  return options;
};

const isTagsLabel = (label: string | null | undefined): boolean =>
  (label ?? '').trim().toLowerCase() === TAGS_LABEL;

const parseTagsDescription = (description: string | null | undefined): string[] => {
  if (!description?.trim()) return [];
  return [
    ...new Set(
      description
        .split(/[,|]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
};

const mergeSearchTags = (existing: string[] | null | undefined, incoming: string[]): string[] =>
  [...new Set([...(existing ?? []).map((tag) => tag.trim()).filter(Boolean), ...incoming])];

const extractTagsFromProductInformation = (
  items: IProductInformationItem[] | null | undefined,
): { tags: string[]; remaining: IProductInformationItem[]; removedCount: number } => {
  const remaining: IProductInformationItem[] = [];
  const tags: string[] = [];
  let removedCount = 0;

  for (const item of items ?? []) {
    if (isTagsLabel(item.label)) {
      removedCount += 1;
      tags.push(...parseTagsDescription(item.description));
      continue;
    }
    remaining.push(item);
  }

  return {
    tags: [...new Set(tags)],
    remaining,
    removedCount,
  };
};

async function migrateSearchTags(options: CliOptions): Promise<MigrationStats> {
  const productRepo = AppDataSource.getRepository(ProductEntity);
  const labelRepo = AppDataSource.getRepository(ProductInformationLabelEntity);

  const stats: MigrationStats = {
    productsScanned: 0,
    productsWithTags: 0,
    productsUpdated: 0,
    variantsUpdated: 0,
    tagsMigrated: 0,
    productsSkippedNoVariants: 0,
    labelsDeactivated: 0,
  };

  const cacheTargets: Array<{ refId: string; slug?: string | null }> = [];

  let offset = 0;
  for (;;) {
    const products = await productRepo.find({
      ...(options.refIds.length > 0 ? { where: { refId: In(options.refIds) } } : {}),
      relations: { variants: true },
      order: { createdAt: 'ASC' },
      take: options.batchSize,
      skip: offset,
      withDeleted: false,
    });

    if (!products.length) break;

    offset += products.length;
    stats.productsScanned += products.length;

    for (const product of products) {
      const { tags, remaining, removedCount } = extractTagsFromProductInformation(
        product.productInformation,
      );

      if (!removedCount) continue;

      stats.productsWithTags += 1;
      stats.tagsMigrated += tags.length;

      const variants = (product.variants ?? []).filter((variant) => !variant.deletedAt);
      if (!variants.length) {
        stats.productsSkippedNoVariants += 1;
        console.warn(
          `[skip] ${product.refId} has Tags in product_information but no active variants`,
        );
        // Still strip Tags from product_information so the stale field is gone.
      }

      console.log(
        `[${options.apply ? 'apply' : 'dry-run'}] ${product.refId} ` +
          `tags=${JSON.stringify(tags)} variants=${variants.length}`,
      );

      if (!options.apply) {
        stats.productsUpdated += 1;
        stats.variantsUpdated += variants.length;
        continue;
      }

      await AppDataSource.transaction(async (manager) => {
        await manager.getRepository(ProductEntity).update(
          { id: product.id },
          { productInformation: remaining },
        );

        for (const variant of variants) {
          const nextTags = mergeSearchTags(variant.searchTags, tags);
          await manager.getRepository(ProductVariantEntity).update(
            { id: variant.id },
            { searchTags: nextTags },
          );
        }
      });

      stats.productsUpdated += 1;
      stats.variantsUpdated += variants.length;
      cacheTargets.push({ refId: product.refId, slug: product.slug });
    }

    if (products.length < options.batchSize) break;
  }

  if (options.deactivateLabel) {
    const tagsLabels = await labelRepo.find({
      where: { name: 'Tags' },
    });
    // Also catch case variants via scan if name casing differs.
    const allLabels = tagsLabels.length
      ? tagsLabels
      : (await labelRepo.find({ where: { deletedAt: IsNull() } })).filter((label) =>
          isTagsLabel(label.name),
        );

    for (const label of allLabels) {
      console.log(
        `[${options.apply ? 'apply' : 'dry-run'}] deactivate label "${label.name}" (${label.refId})`,
      );
      if (options.apply) {
        await labelRepo.update(
          { id: label.id },
          { status: MasterStatus.INACTIVE },
        );
        await labelRepo.softDelete({ id: label.id });
      }
      stats.labelsDeactivated += 1;
    }
  }

  if (options.apply && cacheTargets.length) {
    const cacheResult = await invalidateProductCache(cacheTargets, false);
    console.log(
      `Redis cache: connected=${cacheResult.connected} keysDeleted=${cacheResult.keysDeleted}`,
    );
  }

  return stats;
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));

  console.log(
    `Mode: ${options.apply ? 'APPLY' : 'DRY-RUN'} | batchSize=${options.batchSize}` +
      (options.refIds.length ? ` | refIds=${options.refIds.join(',')}` : '') +
      (options.deactivateLabel ? ' | deactivateLabel=true' : ''),
  );

  await AppDataSource.initialize();
  try {
    const stats = await migrateSearchTags(options);
    console.log('\nDone.');
    console.log(JSON.stringify(stats, null, 2));
    if (!options.apply) {
      console.log('\nRe-run with --apply to persist changes.');
      console.log('After apply, run: npm run typesense:reindex');
    }
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
