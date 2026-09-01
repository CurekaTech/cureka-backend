import { generateProductSlug } from './product-slug.util';
import { APP_CONSTANTS } from '@packages/common';

const maxSlugLength = (): number => APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH;

export const buildVariantSlugSuffix = (attributeValues: string[]): string =>
  attributeValues
    .map((value) => generateProductSlug(value))
    .filter(Boolean)
    .join('-');

const pushUnique = (candidates: string[], value: string): void => {
  const slug = value.slice(0, maxSlugLength());
  if (slug && !candidates.includes(slug)) {
    candidates.push(slug);
  }
};

/**
 * Preferred slugs for a new variant, in order:
 * 1. Explicit slug (when provided)
 * 2. Product name slug
 * 3. Product name + variant attribute values (size, pack, etc.) — only used if #2 is taken
 *
 * SKU is never included.
 */
export const buildVariantSlugCandidates = (
  productSlug: string,
  input: { slug?: string; attributeValues?: string[] },
): string[] => {
  const candidates: string[] = [];
  const base = productSlug.slice(0, maxSlugLength());

  if (input.slug?.trim()) {
    const normalized = generateProductSlug(input.slug.trim());
    if (normalized) {
      pushUnique(candidates, normalized);
      return candidates;
    }
  }

  if (base) {
    pushUnique(candidates, base);
  }

  const attributeSuffix = buildVariantSlugSuffix(input.attributeValues ?? []);
  if (base && attributeSuffix) {
    pushUnique(candidates, `${base}-${attributeSuffix}`);
  }

  return candidates;
};

/** First preferred slug (name-only, or explicit). Does not append SKU. */
export const buildVariantSlug = (
  productSlug: string,
  input: { slug?: string; attributeValues?: string[] },
): string => {
  const [first] = buildVariantSlugCandidates(productSlug, input);
  return (first ?? productSlug).slice(0, maxSlugLength());
};
