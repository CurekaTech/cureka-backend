/**
 * Banner and home-section links are stored as entered.
 * A techbv URL such as https://cureka.techbv.in/promotional/himalay-buy
 * stays absolute, the same as a www.cureka.com URL. A path-only value is kept too.
 */
export const rewriteLegacyStorefrontUrl = (
  value: string | null | undefined,
): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed;
};
