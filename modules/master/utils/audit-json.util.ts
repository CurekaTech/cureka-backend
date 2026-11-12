const MAX_DEPTH = 6;
const MAX_STRING = 2000;
const MAX_ARRAY = 50;
const MAX_KEYS = 80;
const MAX_BYTES = 48_000;

export function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null && right == null) return true;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  try {
    return JSON.stringify(toJsonValue(left)) === JSON.stringify(toJsonValue(right));
  } catch {
    return false;
  }
}

export function toJsonValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value == null) return value ?? null;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return '[binary]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => toJsonValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS);
    const output: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      if (typeof nested === 'function') continue;
      output[key] = toJsonValue(nested, depth + 1);
    }
    return output;
  }
  return String(value);
}

export function capJsonObject(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  const normalized = toJsonValue(value);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return null;
  const json = JSON.stringify(normalized);
  if (json.length <= MAX_BYTES) return normalized as Record<string, unknown>;
  return {
    _truncated: true,
    keys: Object.keys(value).slice(0, MAX_KEYS),
  };
}

export function toColumnName(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
