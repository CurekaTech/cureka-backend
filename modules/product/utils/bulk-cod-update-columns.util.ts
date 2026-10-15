export const BULK_COD_UPDATE_HEADERS = ['SKU', 'codAvailable'] as const;

const COD_COLUMN_ALIASES: Record<string, 'sku' | 'codAvailable'> = {
  sku: 'sku',
  codavailable: 'codAvailable',
};

export function resolveCodColumnKey(header: string): 'sku' | 'codAvailable' | null {
  const key = header.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return COD_COLUMN_ALIASES[key] ?? null;
}
