import { generateProductSlug } from './product-slug.util';

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
      return normalized.slice(0, 480);
    }
  }

  const attributeSuffix = buildVariantSlugSuffix(input.attributeValues ?? []);
  if (attributeSuffix) {
    return `${productSlug}-${attributeSuffix}`.slice(0, 480);
  }

  if (input.sku?.trim()) {
    const skuSuffix = generateProductSlug(input.sku.trim());
    if (skuSuffix) {
      return `${productSlug}-${skuSuffix}`.slice(0, 480);
    }
  }

  return productSlug.slice(0, 480);
};
