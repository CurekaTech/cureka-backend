/**
 * Simple products mirror the product title onto their single variant displayName.
 * When the product name changes, update the variant title only if it still matched
 * the previous product name (or was unset) — custom variant titles are preserved.
 */
export function shouldMirrorSimpleVariantDisplayName(
  currentDisplayName: string | null | undefined,
  previousProductName: string,
): boolean {
  const current = currentDisplayName?.trim() ?? '';
  const previous = previousProductName.trim();
  if (!current) return true;
  return current.toLowerCase() === previous.toLowerCase();
}

export function resolveSimpleVariantDisplayName(
  productName: string,
  variantDisplayName?: string | null,
): string {
  const explicit = variantDisplayName?.trim();
  return explicit || productName.trim();
}
