/**
 * Extract numeric product id from a Merchant Center sheet `id` cell
 * (e.g. `apai-95225` → `95225`, `ethi- 17869` → `17869`).
 */
export const extractExternalProductIdFromSheetId = (sheetId: string): string | null => {
  const normalized = String(sheetId ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (!normalized) return null;
  const match = normalized.match(/^(.+)-(\d+)$/);
  return match?.[2] ?? null;
};

/** First 4 alphabetic characters, lowercased (e.g. "Apaisant Hair" → "apai"). */
export const buildTitlePrefix4 = (title: string | null | undefined): string => {
  const letters = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!letters) return 'item';
  if (letters.length >= 4) return letters.slice(0, 4);
  return letters.padEnd(4, 'x');
};

/** Prefer the longest digit run in SKU; keep leading zeros. */
export const extractSkuNumberPart = (sku: string | null | undefined): string | null => {
  const value = String(sku ?? '').trim();
  if (!value) return null;
  const runs = value.match(/\d+/g);
  if (!runs?.length) return null;
  return runs.reduce((best, run) => (run.length >= best.length ? run : best), runs[0]!);
};

export const buildNewProductGoogleMerchantId = (input: {
  displayName?: string | null;
  productName?: string | null;
  sku: string;
}): string => {
  const prefix = buildTitlePrefix4(input.displayName?.trim() || input.productName);
  const digits = extractSkuNumberPart(input.sku);
  const suffix = digits ?? String(input.sku).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${prefix}-${suffix || 'sku'}`;
};

export const resolveGoogleMerchantItemId = (input: {
  externalProductId?: string | null;
  displayName?: string | null;
  productName?: string | null;
  sku: string;
  lookup: Map<string, string> | Record<string, string>;
}): { id: string; source: 'sheet' | 'generated' } => {
  const externalId = input.externalProductId?.trim();
  if (externalId) {
    const fromMap =
      input.lookup instanceof Map
        ? input.lookup.get(externalId)
        : input.lookup[externalId];
    if (fromMap?.trim()) {
      return { id: fromMap.trim(), source: 'sheet' };
    }
  }

  return {
    id: buildNewProductGoogleMerchantId({
      displayName: input.displayName,
      productName: input.productName,
      sku: input.sku,
    }),
    source: 'generated',
  };
};
