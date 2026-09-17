import { EntityManager } from 'typeorm';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantOosTransition } from '../repositories/product-variants.repository';
import {
  resolveAvailabilityFromDelta,
  resolveAvailabilityFromStock,
  resolveManualInStock,
  resolveManualOutOfStock,
} from './variant-stock-availability.util';

const toTransition = (
  variant: Pick<ProductVariantEntity, 'id' | 'productId' | 'sku' | 'displayName'>,
  stock: number,
  productName?: string | null,
): VariantOosTransition => ({
  variantId: variant.id,
  productId: variant.productId,
  sku: variant.sku,
  stock,
  variantDisplayName: variant.displayName,
  productName: productName ?? null,
  occurredAt: new Date(),
});

/**
 * Apply signed stock delta inside a transaction and sync outOfStock.
 * Returns an OOS transition only on INS → OOS.
 */
export async function applyStockDeltaInManager(
  manager: EntityManager,
  variantId: string,
  delta: number,
  options?: { productName?: string | null; lock?: boolean },
): Promise<VariantOosTransition | null> {
  const repo = manager.getRepository(ProductVariantEntity);
  const variant = await repo.findOne({
    where: { id: variantId },
    select: ['id', 'productId', 'sku', 'stock', 'outOfStock', 'displayName'],
    ...(options?.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
  });
  if (!variant) return null;

  const next = resolveAvailabilityFromDelta(
    { stock: variant.stock, outOfStock: variant.outOfStock },
    delta,
  );
  await repo.update(
    { id: variantId },
    { stock: next.stock, outOfStock: next.outOfStock },
  );

  if (!next.becameOos) return null;
  return toTransition(variant, next.stock, options?.productName);
}

/**
 * Set absolute stock and sync outOfStock inside a transaction.
 */
export async function applyAbsoluteStockInManager(
  manager: EntityManager,
  variantId: string,
  stock: number,
): Promise<VariantOosTransition | null> {
  const repo = manager.getRepository(ProductVariantEntity);
  const variant = await repo.findOne({
    where: { id: variantId },
    select: ['id', 'productId', 'sku', 'stock', 'outOfStock', 'displayName'],
  });
  if (!variant) return null;

  const next = resolveAvailabilityFromStock(stock, variant.outOfStock);
  await repo.update(
    { id: variantId },
    { stock: next.stock, outOfStock: next.outOfStock },
  );

  if (!next.becameOos) return null;
  return toTransition(variant, next.stock);
}

export async function applyManualOutOfStockInManager(
  manager: EntityManager,
  variantId: string,
): Promise<VariantOosTransition | null> {
  const repo = manager.getRepository(ProductVariantEntity);
  const variant = await repo.findOne({
    where: { id: variantId },
    select: ['id', 'productId', 'sku', 'stock', 'outOfStock', 'displayName'],
  });
  if (!variant) return null;

  const next = resolveManualOutOfStock({
    stock: variant.stock,
    outOfStock: variant.outOfStock,
  });
  await repo.update(
    { id: variantId },
    { stock: next.stock, outOfStock: next.outOfStock },
  );

  if (!next.becameOos) return null;
  return toTransition(variant, next.stock);
}

export {
  resolveAvailabilityFromDelta,
  resolveAvailabilityFromStock,
  resolveManualInStock,
  resolveManualOutOfStock,
};
