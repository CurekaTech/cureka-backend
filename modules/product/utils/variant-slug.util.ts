import { generateProductSlug } from './product-slug.util';
import { APP_CONSTANTS } from '@packages/common';

const maxSlugLength = (): number => APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH;

export const buildVariantSlugSuffix = (attributeValues: string[]): string =>
  attributeValues
    .map((value) => generateProductSlug(value))
    .filter(Boolean)
    .join('-');

export const buildVariantSlug = (
  productSlug: string,
  input: { slug?: string; sku?: string; attributeValues?: string[] },
): string => {
  if (input.slug?.trim()) {
    const normalized = generateProductSlug(input.slug.trim());
    if (normalized) {
      return normalized.slice(0, maxSlugLength());
    }
  }

  const attributeSuffix = buildVariantSlugSuffix(input.attributeValues ?? []);
  if (attributeSuffix) {
    return `${productSlug}-${attributeSuffix}`.slice(0, maxSlugLength());
  }

  if (input.sku?.trim()) {
    const skuSuffix = generateProductSlug(input.sku.trim());
    if (skuSuffix) {
      return `${productSlug}-${skuSuffix}`.slice(0, maxSlugLength());
    }
  }

  return productSlug.slice(0, maxSlugLength());
};
