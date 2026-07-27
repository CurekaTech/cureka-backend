import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  IUnicommerceItemType,
  IUnicommerceChannelItemType,
} from '../interfaces/unicommerce-catalog.interface';

function toNumber(value: string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMillimeters(value: string | null, unit: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;

  const normalizedUnit = (unit ?? 'mm').trim().toLowerCase();
  if (normalizedUnit === 'cm') return parsed * 10;
  if (normalizedUnit === 'm') return parsed * 1000;
  if (normalizedUnit === 'in' || normalizedUnit === 'inch' || normalizedUnit === 'inches') {
    return parsed * 25.4;
  }
  return parsed;
}

export function formatUnicommerceSize(variant: ProductVariantEntity): string {
  const length = toMillimeters(variant.length, variant.lengthUnit).toFixed(2);
  const width = toMillimeters(variant.width, variant.widthUnit).toFixed(2);
  const height = toMillimeters(variant.height, variant.heightUnit).toFixed(2);
  return `${length}X${width}X${height}`;
}

function resolveVariantColor(variant: ProductVariantEntity): string | undefined {
  const colorValue = variant.attributeValues?.find((entry) => {
    const attributeName = entry.attribute?.name?.trim().toLowerCase();
    return attributeName === 'color' || attributeName === 'colour';
  })?.value;

  return colorValue?.trim() || undefined;
}

function resolveVariantTitle(product: ProductEntity, variant: ProductVariantEntity): string {
  const attributeLabel = variant.attributeValues
    ?.map((entry) => entry.value?.trim())
    .filter(Boolean)
    .join(' / ');

  if (attributeLabel) {
    return `${product.name} (${attributeLabel})`;
  }

  return product.name;
}

function resolveVariantImage(
  productMedia: ProductMediaEntity[],
  variantId: string,
): ProductMediaEntity | undefined {
  const variantMedia = productMedia
    .filter((media) => media.variantId === variantId)
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      return left.sortOrder - right.sortOrder;
    });

  if (variantMedia.length) {
    return variantMedia[0];
  }

  return productMedia
    .filter((media) => !media.variantId)
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      return left.sortOrder - right.sortOrder;
    })[0];
}

// ─── Official Unicommerce tenant API mappers ──────────────────────────────────

export interface ItemTypeMapperOptions {
  /** Category code registered in Unicommerce. Defaults to 'null' (required placeholder). */
  categoryCode?: string;
  /** Default HSN code when variant has none. */
  defaultHsnCode?: string;
  /** Base URL for product page links. */
  productBaseUrl?: string;
}

/**
 * Maps all active variants of a product to the official Unicommerce
 * `itemTypes/createOrEdit` format.  Each variant becomes one itemType entry.
 */
export function mapProductToItemTypes(
  product: ProductEntity,
  options: {
    imageUrlByMediaId: Map<string, string | undefined>;
    categoryCode?: string;
    defaultHsnCode?: string;
    productBaseUrl?: string;
  },
): IUnicommerceItemType[] {
  const activeVariants = (product.variants ?? []).filter(
    (variant) => !variant.deletedAt && variant.status === VariantStatus.ACTIVE,
  );

  const brand = product.brand?.name?.trim() || 'Cureka';
  const categoryCode = options.categoryCode || 'null';

  return activeVariants.map((variant) => {
    const imageMedia = resolveVariantImage(product.media ?? [], variant.id);
    const imageUrl = imageMedia ? options.imageUrlByMediaId.get(imageMedia.id) : undefined;
    const productPageUrl = options.productBaseUrl
      ? `${options.productBaseUrl.replace(/\/+$/, '')}/${variant.slug}`
      : undefined;

    const hsnCode = (variant.hsnCode ?? options.defaultHsnCode ?? '').trim() || undefined;
    const mrp = toNumber(variant.mrp) || undefined;
    const basePrice = toNumber(variant.sellingPrice) || undefined;
    const weightGrams = variant.weight
      ? (() => {
          const w = Number(variant.weight);
          if (!Number.isFinite(w)) return undefined;
          const unit = (variant.weightUnit ?? 'gm').trim().toLowerCase();
          if (unit === 'kg') return w * 1000;
          return w;
        })()
      : undefined;

    const size = formatUnicommerceSize(variant);
    const color = resolveVariantColor(variant);
    const title = resolveVariantTitle(product, variant);

    return {
      skuCode: variant.sku,
      name: title,
      categoryCode,
      type: 'SIMPLE' as const,
      brand,
      hsnCode,
      maxRetailPrice: mrp,
      basePrice,
      imageUrl: imageUrl?.slice(0, 255),
      productPageUrl: productPageUrl?.slice(0, 255),
      weight: weightGrams ? Math.round(weightGrams) : undefined,
      size,
      color,
      enabled: true,
      tags: (variant.searchTags ?? []).slice(0, 10),
    };
  });
}

/**
 * Builds channel item payloads for each active variant.
 * Used by POST /services/rest/v1/channel/createChannelItem
 * Call after `itemTypes/createOrEdit` succeeds.
 */
export function mapVariantsToChannelItemTypes(
  product: ProductEntity,
  channelCode: string,
): IUnicommerceChannelItemType[] {
  const activeVariants = (product.variants ?? []).filter(
    (variant) => !variant.deletedAt && variant.status === VariantStatus.ACTIVE,
  );

  return activeVariants.map((variant) => ({
    channelCode,
    channelProductId: variant.sku,
    sellerSkuCode: variant.sku,
    skuCode: variant.sku,
    live: true,
    verified: true,
  }));
}
