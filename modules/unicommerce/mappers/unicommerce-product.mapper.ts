import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  IUnicommerceCatalogProduct,
  IUnicommerceProductVariant,
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

export function mapProductToUnicommerceCatalog(
  product: ProductEntity,
  options: {
    imageUrlByMediaId: Map<string, string | undefined>;
    productBaseUrl?: string;
  },
): IUnicommerceCatalogProduct | null {
  const activeVariants = (product.variants ?? []).filter(
    (variant) => !variant.deletedAt && variant.status === VariantStatus.ACTIVE,
  );

  if (!activeVariants.length) {
    return null;
  }

  const variants: IUnicommerceProductVariant[] = activeVariants.map((variant) => {
    const imageMedia = resolveVariantImage(product.media ?? [], variant.id);
    const imageUrl = imageMedia ? options.imageUrlByMediaId.get(imageMedia.id) : undefined;
    const productUrl = options.productBaseUrl
      ? `${options.productBaseUrl.replace(/\/+$/, '')}/${variant.slug}`
      : undefined;

    return {
      imageUrl,
      productUrl,
      variantId: variant.sku,
      title: resolveVariantTitle(product, variant),
      sku: variant.sku,
      size: formatUnicommerceSize(variant),
      color: resolveVariantColor(variant),
      live: true,
      itemPrice: {
        currency: 'INR',
        listingPrice: toNumber(variant.sellingPrice),
        mrp: toNumber(variant.mrp),
      },
      inventory: variant.stock,
    };
  });

  return {
    id: product.refId,
    parentTitle: product.name,
    brand: product.brand?.name?.trim() || 'Cureka',
    variants,
    created: (product.publishedAt ?? product.createdAt).toISOString(),
  };
}
