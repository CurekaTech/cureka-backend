import { generateProductSlug } from './product-slug.util';
import { buildVariantSlugCandidates, buildVariantSlugSuffix } from './variant-slug.util';

const buildLegacySkuCandidates = (
  productSlug: string,
  attributeValues: string[],
  sku: string,
): string[] => {
  const skuSlug = generateProductSlug(sku);
  if (!productSlug || !skuSlug) return [];

  const attributeSuffix = buildVariantSlugSuffix(attributeValues);
  const baseCandidates = [productSlug];
  if (attributeSuffix) {
    baseCandidates.push(`${productSlug}-${attributeSuffix}`);
  }

  return baseCandidates.map((base) => `${base}-${skuSlug}`);
};

/**
 * Regenerate a variant slug on product-title/product-slug edits only when the
 * current slug still looks auto-generated from the previous product slug.
 * Custom variant slugs must remain untouched.
 */
export const shouldRegenerateVariantSlugFromProductChange = (input: {
  currentSlug: string | null | undefined;
  previousProductSlug: string;
  nextProductSlug: string;
  attributeValues: string[];
  sku: string;
}): boolean => {
  const currentSlug = input.currentSlug?.trim();
  if (!currentSlug) return true;
  if (input.previousProductSlug.trim() === input.nextProductSlug.trim()) return false;

  const autoCandidates = [
    ...buildVariantSlugCandidates(input.previousProductSlug, {
      attributeValues: input.attributeValues,
    }),
    ...buildLegacySkuCandidates(
      input.previousProductSlug,
      input.attributeValues,
      input.sku,
    ),
  ];

  return autoCandidates.some(
    (candidate) =>
      currentSlug === candidate ||
      currentSlug.startsWith(`${candidate}-`),
  );
};
