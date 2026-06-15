export interface IVariantAttributeInput {
  attributeId: string;
  value: string;
}

/** Normalizes attribute value for consistent combination keys. */
export const normalizeAttributeValue = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Builds a deterministic combination key from variant attribute pairs.
 * Used for duplicate variant detection — NOT for UI display labels.
 *
 * @example
 * buildVariantCombinationKey([
 *   { attributeId: 'color-uuid', value: 'White' },
 *   { attributeId: 'size-uuid', value: '1' },
 * ])
 * // => "color-uuid:white|size-uuid:1"
 */
export const buildVariantCombinationKey = (
  attributes: IVariantAttributeInput[],
): string | null => {
  if (!attributes.length) return null;

  return [...attributes]
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId))
    .map(({ attributeId, value }) => `${attributeId}:${normalizeAttributeValue(value)}`)
    .join('|');
};

/** Detect duplicate combination keys within a variant batch. */
export const findDuplicateCombinationKeys = (
  keys: Array<string | null>,
): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const key of keys) {
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }

  return [...duplicates];
};
