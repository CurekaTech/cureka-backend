import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  coerceDbBoolean,
  isCurekaInventoryManaged,
} from '@packages/common/stock-validation.config';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantOosTransition } from '../repositories/product-variants.repository';
import {
  resolveAvailabilityFromDelta,
  resolveAvailabilityFromStock,
  resolveManualInStock,
  resolveManualOutOfStock,
  managementOptionsForVariant,
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

const VARIANT_STOCK_SELECT = [
  'id',
  'productId',
  'sku',
  'stock',
  'outOfStock',
  'inCurekaInventory',
  'displayName',
] as const;

async function loadVariantForStockWrite(
  manager: EntityManager,
  variantId: string,
  lock?: boolean,
): Promise<ProductVariantEntity | null> {
  const repo = manager.getRepository(ProductVariantEntity);
  const variant = !lock
    ? await repo.findOne({
        where: { id: variantId },
        select: [...VARIANT_STOCK_SELECT],
      })
    : await repo
        .createQueryBuilder('v')
        .setLock('pessimistic_write')
        .where('v.id = :id', { id: variantId })
        .select([
          'v.id',
          'v.productId',
          'v.sku',
          'v.stock',
          'v.outOfStock',
          'v.inCurekaInventory',
          'v.displayName',
        ])
        .getOne();

  if (!variant) return null;

  // QueryBuilder/drivers can return string/int booleans — normalize before gates.
  variant.inCurekaInventory = coerceDbBoolean(variant.inCurekaInventory);
  variant.outOfStock = coerceDbBoolean(variant.outOfStock);
  return variant;
}

/**
 * Apply signed stock delta inside a transaction when the variant is Cureka-managed.
 * No-op (returns null) for flag-only variants — stock ledger is not owned by Cureka.
 * Syncs outOfStock from stock when managed. Returns OOS transition only on INS → OOS.
 */
export async function applyStockDeltaInManager(
  manager: EntityManager,
  variantId: string,
  delta: number,
  options?: { productName?: string | null; lock?: boolean; requireVariant?: boolean },
): Promise<VariantOosTransition | null> {
  const variant = await loadVariantForStockWrite(manager, variantId, options?.lock);
  if (!variant) {
    if (options?.requireVariant === true) {
      throw new BadRequestException(`Variant ${variantId} not found while adjusting stock`);
    }
    return null;
  }

  if (!isCurekaInventoryManaged(variant)) {
    return null;
  }

  const next = resolveAvailabilityFromDelta(
    { stock: variant.stock, outOfStock: variant.outOfStock },
    delta,
    managementOptionsForVariant(variant),
  );
  await manager.getRepository(ProductVariantEntity).update(
    { id: variantId },
    { stock: next.stock, outOfStock: next.outOfStock },
  );

  if (!next.becameOos) return null;
  return toTransition(variant, next.stock, options?.productName);
}

/**
 * Set absolute stock and sync outOfStock when Cureka-managed.
 * No-op for flag-only variants — stock ledger / auto-OOS are not owned by Cureka.
 */
export async function applyAbsoluteStockInManager(
  manager: EntityManager,
  variantId: string,
  stock: number,
): Promise<VariantOosTransition | null> {
  const variant = await loadVariantForStockWrite(manager, variantId);
  if (!variant) return null;

  if (!isCurekaInventoryManaged(variant)) {
    return null;
  }

  const next = resolveAvailabilityFromStock(
    stock,
    variant.outOfStock,
    managementOptionsForVariant(variant),
  );
  await manager.getRepository(ProductVariantEntity).update(
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
  const variant = await loadVariantForStockWrite(manager, variantId);
  if (!variant) return null;

  const next = resolveManualOutOfStock(
    {
      stock: variant.stock,
      outOfStock: variant.outOfStock,
    },
    managementOptionsForVariant(variant),
  );
  await manager.getRepository(ProductVariantEntity).update(
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
  managementOptionsForVariant,
};
