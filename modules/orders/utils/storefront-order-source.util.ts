import { OrderSource } from '../enums/order-source.enum';

/**
 * Normalize client-provided storefront sources (App / Website).
 * Accepts common casing / aliases so mobile clients do not silently fall back to Website.
 */
export function normalizeStorefrontOrderSource(value: unknown): OrderSource | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return value as OrderSource;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === 'app' || normalized === 'android app' || normalized === 'ios app') {
    return OrderSource.APP;
  }
  if (normalized === 'website' || normalized === 'web') {
    return OrderSource.WEBSITE;
  }

  return trimmed as OrderSource;
}

/** Prefer explicit body value, then cart sticky source, else Website. */
export function resolveStorefrontOrderSource(
  explicit?: OrderSource | null,
  cartSource?: OrderSource | null,
): OrderSource {
  if (explicit === OrderSource.APP || explicit === OrderSource.WEBSITE) {
    return explicit;
  }
  if (cartSource === OrderSource.APP || cartSource === OrderSource.WEBSITE) {
    return cartSource;
  }
  return OrderSource.WEBSITE;
}
