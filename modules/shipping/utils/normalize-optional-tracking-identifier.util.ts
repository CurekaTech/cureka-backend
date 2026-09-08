/**
 * Normalize optional Shipway tracking identifiers before DTO validation.
 *
 * Legitimate provider values: missing/empty → omit; digit strings (keep leading zeros);
 * safe JSON integers → decimal string. Do not coerce arrays/objects/booleans.
 * Unsafe / non-integer numbers are left unchanged so validation rejects them.
 */
export function normalizeOptionalTrackingIdentifier({
  value,
}: {
  value: unknown;
}): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return value;
    }
    if (!Number.isSafeInteger(value)) {
      return value;
    }
    // Decimal string — preserves exact safe-integer digits without scientific notation.
    return value.toString(10);
  }

  // Arrays, objects, booleans, symbols, functions — do not coerce.
  return value;
}
