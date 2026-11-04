const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_ID_RE = /^[A-Z]{3}\d{8}(\d{2})?$/;

export type CartLookupKind = 'uuid' | 'refId';

export const isCartUuid = (value: string): boolean => UUID_RE.test(value.trim());

/** Returns uuid | refId for DB lookup, or null so callers skip the uuid column. */
export const parseCartLookupId = (raw: string | undefined | null): {
  kind: CartLookupKind;
  value: string;
} | null => {
  const value = raw?.trim() ?? '';
  if (!value) return null;
  if (isCartUuid(value)) return { kind: 'uuid', value };
  if (REF_ID_RE.test(value.toUpperCase())) return { kind: 'refId', value: value.toUpperCase() };
  return null;
};
