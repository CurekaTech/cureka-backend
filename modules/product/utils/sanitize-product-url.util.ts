/**
 * Normalize legacy product slugs / product_page_url values that contain
 * inch marks (″), degree marks (˚), or their percent-encoded forms.
 *
 * WordPress imported paths often stored the encoding literally (e.g. `%e2%80%b3`)
 * which breaks Next.js routing and Typesense-driven links on beta.
 */

/** Decode percent-encoding a few times; ignore malformed sequences. */
export const decodeProductUrlEncoding = (value: string): string => {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(current.replace(/\+/g, ' '));
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
};

/**
 * Replace inch / degree marks with readable slug tokens, then keep [a-z0-9-].
 * Does not touch path separators — use {@link sanitizeProductPagePath} for full paths.
 */
export const sanitizeProductSlugSegment = (raw: string): string => {
  let value = String(raw ?? '').trim().toLowerCase();

  // Literal percent-encoding as stored in DB (before decode).
  value = value
    .replace(/%e2%80%b3/gi, '-inches')
    .replace(/%e2%80%b2/gi, '-inches')
    .replace(/%22/gi, '-inches')
    .replace(/%cb%9a/gi, '-degree')
    .replace(/%c2%b0/gi, '-degree');

  value = decodeProductUrlEncoding(value);

  return value
    .replace(/[″‟＂"˝ʺ]/g, '-inches')
    .replace(/[˚°º]/g, '-degree')
    // Hex leftovers when `%` was stripped during an earlier slug pass.
    .replace(/e280b3/gi, '-inches')
    .replace(/e280b2/gi, '-inches')
    .replace(/cb9a/gi, '-degree')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/** Sanitize a full `/shop/.../...` product path (each segment cleaned). */
export const sanitizeProductPagePath = (raw: string): string => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      path = new URL(trimmed).pathname;
    }
  } catch {
    // keep raw
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  const trailingSlash = path.length > 1 && path.endsWith('/');
  const cleaned = path
    .split('/')
    .map((segment) => (segment ? sanitizeProductSlugSegment(segment) : ''))
    .join('/');

  const withoutTrailing = cleaned.replace(/\/+$/, '') || '/';
  return trailingSlash && withoutTrailing !== '/'
    ? `${withoutTrailing}/`
    : withoutTrailing;
};

/** True when sanitizing would change the path/slug (needs redirect or DB fix). */
export const productUrlNeedsSanitization = (raw: string): boolean => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return false;
  if (trimmed.includes('/')) {
    const normalized = trimmed.replace(/\/+$/, '') || '/';
    const sanitized = sanitizeProductPagePath(normalized).replace(/\/+$/, '') || '/';
    return normalized !== sanitized;
  }
  return sanitizeProductSlugSegment(trimmed) !== trimmed.toLowerCase();
};
