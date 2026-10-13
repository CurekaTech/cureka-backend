export const BULK_RETURN_UPDATE_HEADERS = [
  'SKU',
  'returnAllowed',
  'returnPolicy',
  'returnWindowDays',
  'replaceAllowed',
  'replaceWindowDays',
  'refundAllowed',
] as const;

export type ReturnColumnKey =
  | 'sku'
  | 'returnAllowed'
  | 'returnPolicy'
  | 'returnWindowDays'
  | 'replaceAllowed'
  | 'replaceWindowDays'
  | 'refundAllowed';

const RETURN_COLUMN_ALIASES: Record<string, ReturnColumnKey> = {
  sku: 'sku',
  returnallowed: 'returnAllowed',
  returnpolicy: 'returnPolicy',
  returnwindowdays: 'returnWindowDays',
  replaceallowed: 'replaceAllowed',
  replacewindowdays: 'replaceWindowDays',
  refundallowed: 'refundAllowed',
};

export function resolveReturnColumnKey(header: string): ReturnColumnKey | null {
  const key = header.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return RETURN_COLUMN_ALIASES[key] ?? null;
}
