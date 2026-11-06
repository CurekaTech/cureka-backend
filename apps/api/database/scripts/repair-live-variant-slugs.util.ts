import { generateProductSlug } from '../../../../modules/product/utils/product-slug.util';
import { APP_CONSTANTS } from '../../../../packages/common/src/app.constants';

const maxSlugLength = (): number => APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH;

/** Strip a uniqueness suffix `-2` only (not `-12`). */
export const stripTrailingMinusTwo = (slug: string): string | null => {
  const trimmed = String(slug ?? '').trim();
  if (trimmed.length < 3 || !trimmed.toLowerCase().endsWith('-2')) return null;
  const stem = trimmed.slice(0, -2);
  return stem.trim() ? stem : null;
};

export const pathLeaf = (value: string | null | undefined): string | null => {
  const raw = value?.trim();
  if (!raw) return null;
  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) path = new URL(raw).pathname;
  } catch {
    // keep path
  }
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
};

/** Rewrite a URL/path leaf when it matches any of the old slugs and the leaf actually changes. */
export const proposePageUrl = (
  pageUrl: string | null | undefined,
  oldLeaves: string[],
  proposedSlug: string,
): string | null => {
  const raw = pageUrl?.trim();
  if (!raw) return null;

  const trailingSlash = raw.endsWith('/');
  let path = raw;
  let origin = '';
  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      path = parsed.pathname;
      origin = `${parsed.origin}`;
    }
  } catch {
    // keep path as-is
  }
  if (!path.startsWith('/')) path = `/${path}`;

  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  if (!parts.length) return null;

  const leaf = parts[parts.length - 1];
  const old = new Set(oldLeaves.map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!old.has(leaf.toLowerCase())) return null;

  const nextLeaf = proposedSlug.slice(0, maxSlugLength());
  if (leaf.toLowerCase() === nextLeaf.toLowerCase()) return null;

  parts[parts.length - 1] = nextLeaf;
  const rebuiltPath = `/${parts.join('/')}${trailingSlash ? '/' : ''}`;
  return origin ? `${origin}${rebuiltPath}` : rebuiltPath;
};

export type MinusTwoRepairReason =
  | 'parent_collision_suffix'
  | 'uniqueness_suffix_not_in_name'
  | 'semantic_name_minus_2'
  | 'none';

export interface MinusTwoClassification {
  repairProduct: boolean;
  repairVariant: boolean;
  proposedProductSlug: string;
  proposedVariantSlug: string;
  reason: MinusTwoRepairReason;
}

/**
 * `-2` is a false uniqueness suffix only when it is not part of the product name
 * (e.g. pack-of-2). Parent-collision `variant = productSlug-2` is still repaired.
 */
export const classifyMinusTwo = (input: {
  productName: string;
  productSlug: string;
  variantSlug: string;
}): MinusTwoClassification => {
  const productSlug = String(input.productSlug ?? '').trim();
  const variantSlug = String(input.variantSlug ?? '').trim();
  const nameSlug = generateProductSlug(input.productName);
  const productStem = stripTrailingMinusTwo(productSlug);
  const variantStem = stripTrailingMinusTwo(variantSlug);

  const repairProduct = Boolean(
    productStem &&
      productStem.toLowerCase() === nameSlug.toLowerCase() &&
      nameSlug.toLowerCase() !== productSlug.toLowerCase(),
  );
  const proposedProductSlug = (repairProduct ? productStem! : productSlug).slice(
    0,
    maxSlugLength(),
  );

  const variantIsNameSlug = variantSlug.toLowerCase() === nameSlug.toLowerCase();
  const variantMatchesParentPlus2 = Boolean(
    variantStem &&
      (variantStem.toLowerCase() === productSlug.toLowerCase() ||
        variantSlug.toLowerCase() === `${productSlug.toLowerCase()}-2`),
  );

  const repairVariant = Boolean(
    proposedProductSlug &&
      ((variantMatchesParentPlus2 && !variantIsNameSlug) ||
        (repairProduct && variantSlug.toLowerCase() === productSlug.toLowerCase()) ||
        (repairProduct &&
          variantStem?.toLowerCase() === proposedProductSlug.toLowerCase())),
  );

  const proposedVariantSlug = (repairVariant ? proposedProductSlug : variantSlug).slice(
    0,
    maxSlugLength(),
  );

  if (!repairProduct && !repairVariant) {
    const semantic =
      Boolean(productStem) && nameSlug.toLowerCase() === productSlug.toLowerCase();
    return {
      repairProduct: false,
      repairVariant: false,
      proposedProductSlug,
      proposedVariantSlug,
      reason: semantic ? 'semantic_name_minus_2' : 'none',
    };
  }

  return {
    repairProduct,
    repairVariant,
    proposedProductSlug,
    proposedVariantSlug,
    reason:
      variantMatchesParentPlus2 && !repairProduct
        ? 'parent_collision_suffix'
        : 'uniqueness_suffix_not_in_name',
  };
};

/** Detect slugs that were wrongly stripped off a name that naturally ends in -2. */
export const classifySemanticMinusTwoRestore = (input: {
  productName: string;
  currentProductSlug: string;
  currentVariantSlug: string;
}): { restore: boolean; restoreSlug: string; restoreVariant: boolean } => {
  const nameSlug = generateProductSlug(input.productName);
  const nameStem = stripTrailingMinusTwo(nameSlug);
  const currentProduct = String(input.currentProductSlug ?? '').trim();
  const currentVariant = String(input.currentVariantSlug ?? '').trim();

  if (!nameStem || currentProduct.toLowerCase() !== nameStem.toLowerCase()) {
    return { restore: false, restoreSlug: nameSlug, restoreVariant: false };
  }

  const restoreVariant =
    currentVariant.toLowerCase() === currentProduct.toLowerCase() ||
    currentVariant.toLowerCase() === nameSlug.toLowerCase();

  return { restore: true, restoreSlug: nameSlug, restoreVariant };
};
