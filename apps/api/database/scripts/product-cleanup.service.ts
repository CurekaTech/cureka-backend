import { DataSource, EntityManager, In } from 'typeorm';
import { isValidRefId } from '@packages/common';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ProductBundleEntity } from '../../../../modules/product/entities/product-bundle.entity';
import { CartItemEntity } from '../../../../modules/orders/entities/cart-item.entity';
import { OrderItemEntity } from '../../../../modules/orders/entities/order-item.entity';
import { invalidateProductCache } from './product-cleanup.redis';

export interface ProductCleanupOptions {
  refIds?: string[];
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

export interface ProductCleanupTarget {
  id: string;
  refId: string;
  slug: string;
  deletedAt?: Date | null;
}

export interface ProductCleanupItemResult {
  refId: string;
  slug: string;
  status: 'deleted' | 'skipped' | 'not_found';
  reason?: string;
}

export interface ProductCleanupSummary {
  results: ProductCleanupItemResult[];
  cache: { connected: boolean; keysDeleted: number };
}

const normalizeRefIds = (refIds: string[]): string[] =>
  [...new Set(refIds.map((refId) => refId.trim().toUpperCase()).filter(Boolean))];

const resolveTargets = async (
  dataSource: DataSource,
  options: ProductCleanupOptions,
): Promise<{ targets: ProductCleanupTarget[]; invalidRefIds: string[] }> => {
  const repo = dataSource.getRepository(ProductEntity);

  if (options.all) {
    const targets = await repo
      .createQueryBuilder('product')
      .select(['product.id', 'product.refId', 'product.slug', 'product.deletedAt'])
      .withDeleted()
      .getMany();

    return { targets, invalidRefIds: [] };
  }

  const refIds = normalizeRefIds(options.refIds ?? []);
  const invalidRefIds = refIds.filter((refId) => !isValidRefId(refId));
  const validRefIds = refIds.filter((refId) => isValidRefId(refId));

  if (validRefIds.length === 0) {
    return { targets: [], invalidRefIds };
  }

  const targets = await repo
    .createQueryBuilder('product')
    .select(['product.id', 'product.refId', 'product.slug', 'product.deletedAt'])
    .withDeleted()
    .where('product.ref_id IN (:...refIds)', { refIds: validRefIds })
    .getMany();

  return { targets, invalidRefIds };
};

const countBlockers = async (
  manager: EntityManager,
  productId: string,
): Promise<{ orderItems: number }> => {
  const orderItems = await manager.count(OrderItemEntity, { where: { productId } });
  return { orderItems };
};

const describeBlockers = (counts: { orderItems: number }): string[] => {
  if (counts.orderItems > 0) {
    return [`${counts.orderItems} order item(s)`];
  }
  return [];
};

const deleteProductGraph = async (
  manager: EntityManager,
  productIds: string[],
  force: boolean,
): Promise<void> => {
  if (productIds.length === 0) return;

  await manager.delete(CartItemEntity, { productId: In(productIds) });

  if (force) {
    await manager.delete(OrderItemEntity, { productId: In(productIds) });
  }

  await manager.delete(ProductBundleEntity, { childProductId: In(productIds) });
  await manager.delete(ProductBundleEntity, { parentProductId: In(productIds) });

  await manager
    .createQueryBuilder()
    .delete()
    .from(ProductEntity)
    .where('id IN (:...productIds)', { productIds })
    .execute();
};

export const runProductCleanup = async (
  dataSource: DataSource,
  options: ProductCleanupOptions,
): Promise<ProductCleanupSummary> => {
  const { targets, invalidRefIds } = await resolveTargets(dataSource, options);
  const results: ProductCleanupItemResult[] = invalidRefIds.map((refId) => ({
    refId,
    slug: '',
    status: 'not_found',
    reason: 'Invalid refId format',
  }));

  const foundRefIds = new Set(targets.map((target) => target.refId));
  for (const refId of normalizeRefIds(options.refIds ?? [])) {
    if (!isValidRefId(refId) || foundRefIds.has(refId)) continue;
    results.push({
      refId,
      slug: '',
      status: 'not_found',
      reason: 'Product not found',
    });
  }

  const deletableTargets: ProductCleanupTarget[] = [];

  for (const target of targets) {
    const blockers = await countBlockers(dataSource.manager, target.id);
    const blockerReasons = describeBlockers(blockers);

    if (blockers.orderItems > 0 && !options.force) {
      results.push({
        refId: target.refId,
        slug: target.slug,
        status: 'skipped',
        reason: `Blocked by ${blockerReasons.join(', ')}. Re-run with --force to remove order history for this product.`,
      });
      continue;
    }

    deletableTargets.push(target);
  }

  if (!options.dryRun && deletableTargets.length > 0) {
    await dataSource.transaction(async (manager) => {
      const productIds = deletableTargets.map((target) => target.id);
      await deleteProductGraph(manager, productIds, Boolean(options.force));
    });
  }

  for (const target of deletableTargets) {
    results.push({
      refId: target.refId,
      slug: target.slug,
      status: 'deleted',
      reason: options.dryRun ? 'Dry run — no database changes made' : undefined,
    });
  }

  const cache = await invalidateProductCache(
    deletableTargets.map((target) => ({ refId: target.refId, slug: target.slug })),
    Boolean(options.dryRun),
  );

  return { results, cache };
};
