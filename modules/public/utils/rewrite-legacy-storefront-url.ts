const LEGACY_HOSTS = new Set([
  'cureka.techbv.in',
  'www.cureka.techbv.in',
  'cureka.techbv.com',
  'www.cureka.techbv.com',
]);

/**
 * Stored banner CTAs that still point at the old staging hosts.
 * Keeps path, search, and hash as a storefront path.
 */
export const rewriteLegacyStorefrontUrl = (
  value: string | null | undefined,
): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (!LEGACY_HOSTS.has(parsed.hostname.toLowerCase())) return trimmed;

  const path = `${parsed.pathname || '/'}${parsed.search}${parsed.hash}`;
  return path.startsWith('/') ? path : `/${path}`;
};
