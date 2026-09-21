import { STOCK_VALIDATION_ENABLED, isVariantInStock } from '@packages/common';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { SavedForLaterUnavailableReason } from '../constants/saved-for-later.constants';
import { SavedForLaterItemEntity } from '../entities/saved-for-later-item.entity';
import { SavedForLaterListItem } from '../interfaces/saved-for-later.interface';

export function evaluateSavedItemAvailability(
  quantity: number,
  product?: ProductEntity | null,
  variant?: ProductVariantEntity | null,
): {
  canMoveToCart: boolean;
  unavailableReason: SavedForLaterUnavailableReason | null;
  isActive: boolean;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
  availableQuantity: number;
} {
  const rawStock = variant?.stock ?? 0;
  const stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' =
    variant?.outOfStock === true || !isVariantInStock(rawStock, variant ?? undefined)
      ? 'OUT_OF_STOCK'
      : 'IN_STOCK';

  if (!product) {
    return {
      canMoveToCart: false,
      unavailableReason: 'PRODUCT_DELETED',
      isActive: false,
      stockStatus,
      availableQuantity: rawStock,
    };
  }
  if (product.status !== ProductStatus.PUBLISHED) {
    return {
      canMoveToCart: false,
      unavailableReason: 'PRODUCT_INACTIVE',
      isActive: false,
      stockStatus,
      availableQuantity: rawStock,
    };
  }
  if (!variant || variant.status !== VariantStatus.ACTIVE) {
    return {
      canMoveToCart: false,
      unavailableReason: 'VARIANT_INACTIVE',
      isActive: false,
      stockStatus,
      availableQuantity: rawStock,
    };
  }

  const isActive = true;
  if (variant?.outOfStock === true) {
    return {
      canMoveToCart: false,
      unavailableReason: 'OUT_OF_STOCK',
      isActive,
      stockStatus: 'OUT_OF_STOCK',
      availableQuantity: rawStock,
    };
  }
  if (STOCK_VALIDATION_ENABLED(variant)) {
    if (rawStock <= 0) {
      return {
        canMoveToCart: false,
        unavailableReason: 'OUT_OF_STOCK',
        isActive,
        stockStatus,
        availableQuantity: rawStock,
      };
    }
    if (quantity > rawStock) {
      return {
        canMoveToCart: false,
        unavailableReason: 'INSUFFICIENT_STOCK',
        isActive,
        stockStatus,
        availableQuantity: rawStock,
      };
    }
  }

  return {
    canMoveToCart: true,
    unavailableReason: null,
    isActive,
    stockStatus: isVariantInStock(rawStock, variant) ? 'IN_STOCK' : 'OUT_OF_STOCK',
    availableQuantity: rawStock,
  };
}

export function formatSavedVariantLabel(variant?: ProductVariantEntity | null): string | null {
  if (!variant) {
    return null;
  }
  const parts: string[] = [];
  for (const item of variant.attributeValues ?? []) {
    const value = item.value?.trim();
    if (!value) continue;
    const name = item.attribute?.name?.trim();
    parts.push(name ? `${name}: ${value}` : value);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function resolveSavedPrimaryImageRef(
  product: ProductEntity | null | undefined,
  variantId: string,
): IStorageFileReference | null {
  const media = (product?.media ?? []).filter(
    (item: ProductMediaEntity) =>
      item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON,
  );
  if (!media.length) {
    return null;
  }
  const variantMedia = media.filter((item) => item.variantId === variantId);
  const variantPrimary = variantMedia.find((item) => item.isPrimary) ?? variantMedia[0];
  if (variantPrimary?.url) {
    return variantPrimary.url;
  }
  const productMedia = media.filter((item) => !item.variantId);
  const productPrimary = productMedia.find((item) => item.isPrimary) ?? productMedia[0] ?? media[0];
  return productPrimary?.url ?? null;
}

export function mapSavedForLaterListItem(
  entity: SavedForLaterItemEntity,
  image: IStorageFileReferenceResponse | null,
): SavedForLaterListItem {
  const product = entity.product ?? null;
  const variant = entity.variant ?? null;
  const availability = evaluateSavedItemAvailability(entity.quantity, product, variant);
  const currentPrice = variant ? parseFloat(variant.sellingPrice) : null;
  const originalPrice = variant?.mrp != null ? parseFloat(String(variant.mrp)) : null;
  const storedDiscount =
    variant?.discountPercentage != null ? parseFloat(String(variant.discountPercentage)) : null;
  const computedDiscount =
    originalPrice != null && currentPrice != null && originalPrice > 0 && originalPrice > currentPrice
      ? Math.round(((originalPrice - currentPrice) / originalPrice) * 10000) / 100
      : null;

  return {
    id: entity.id,
    productId: entity.productId,
    productVariantId: entity.variantId,
    quantity: entity.quantity,
    isSubscription: !!entity.isSubscription,
    frequency: entity.frequency ?? null,
    product: {
      slug: product?.slug ?? null,
      title: product?.name ?? 'Product unavailable',
      image,
      brand: product?.brand?.name ?? null,
    },
    variant: {
      id: variant?.id ?? null,
      title: formatSavedVariantLabel(variant),
      sku: variant?.sku ?? null,
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      originalPrice: Number.isFinite(originalPrice) ? originalPrice : null,
      discount: Number.isFinite(storedDiscount as number)
        ? storedDiscount
        : computedDiscount,
      stockStatus: availability.stockStatus,
      availableQuantity: availability.availableQuantity,
      isActive: availability.isActive,
    },
    canMoveToCart: availability.canMoveToCart,
    unavailableReason: availability.unavailableReason,
    savedAt: entity.createdAt,
  };
}
