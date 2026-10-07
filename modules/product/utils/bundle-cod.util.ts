/**
 * Bundle COD is derived. There is no editable bundle COD flag.
 * Every component variant must allow COD. An empty list does not.
 */
export const deriveBundleCodAvailable = (
  variants: Array<{ codAvailable?: boolean | null }>,
): boolean => variants.length > 0 && variants.every((variant) => variant.codAvailable === true);
