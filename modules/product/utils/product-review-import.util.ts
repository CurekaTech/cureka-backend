import { createHash } from 'crypto';

const IMPORT_KEY_SEPARATOR = '\u001f';

export function normalizeReviewImportPart(value: string | number | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * SHA-256 of trimmed SKU, customer name, rating, title, and description.
 * Customer name alone is never the key. A later SKU change produces a new hash.
 */
export function buildReviewImportKey(input: {
  sku: string;
  customerName: string;
  rating: number;
  title: string | null;
  description: string | null;
}): string {
  const payload = [
    normalizeReviewImportPart(input.sku),
    normalizeReviewImportPart(input.customerName),
    String(input.rating),
    normalizeReviewImportPart(input.title),
    normalizeReviewImportPart(input.description),
  ].join(IMPORT_KEY_SEPARATOR);
  return createHash('sha256').update(payload).digest('hex');
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Integers 1–5 only. Excel whole numbers such as 4.0 are accepted. */
export function parseReviewImportRating(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    return null;
  }
  return numeric;
}

export interface ActiveVariantSkuMatch {
  id: string;
  sku: string;
  productId: string;
  productRefId: string;
}

export interface ReadyReviewImportRow {
  sku: string;
  customerName: string;
  rating: number;
  title: string | null;
  description: string | null;
  customerAge: string | null;
  customerLocation: string | null;
  variantId: string;
  productId: string;
  productRefId: string;
  importKey: string;
}

export type PreparedReviewImportRow =
  | { status: 'ready'; row: ReadyReviewImportRow }
  | { status: 'skipped'; reason: 'missing_name' | 'invalid_rating' | 'unmatched_sku' | 'ambiguous_sku' };

export function prepareReviewImportRow(input: {
  sku: string;
  customerName: string;
  age: string;
  location: string;
  rating: string | number | null;
  title: string;
  text: string;
  matches: ActiveVariantSkuMatch[];
}): PreparedReviewImportRow {
  const customerName = input.customerName.trim();
  if (!customerName) return { status: 'skipped', reason: 'missing_name' };

  const rating = parseReviewImportRating(input.rating);
  if (rating == null) return { status: 'skipped', reason: 'invalid_rating' };

  const sku = input.sku.trim();
  if (!sku || input.matches.length === 0) return { status: 'skipped', reason: 'unmatched_sku' };
  if (input.matches.length > 1) return { status: 'skipped', reason: 'ambiguous_sku' };

  const match = input.matches[0]!;
  const title = blankToNull(input.title);
  const description = blankToNull(input.text);

  return {
    status: 'ready',
    row: {
      sku: match.sku,
      customerName,
      rating,
      title,
      description,
      customerAge: blankToNull(input.age),
      customerLocation: blankToNull(input.location),
      variantId: match.id,
      productId: match.productId,
      productRefId: match.productRefId,
      importKey: buildReviewImportKey({
        sku: match.sku,
        customerName,
        rating,
        title,
        description,
      }),
    },
  };
}

export function describeDatabaseTarget(databaseUrl: string): { host: string; database: string } {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const host = parsed.hostname;
  if (!host || !database) {
    throw new Error('DATABASE_URL must include a host and database name');
  }
  return { host, database };
}

export function assertReviewImportWriteAllowed(input: {
  mode: 'test' | 'live';
  apply: boolean;
  confirmLive: boolean;
  databaseName: string;
  liveDatabaseName: string | undefined;
}): void {
  if (!input.apply) return;

  if (input.mode === 'test') {
    if (input.liveDatabaseName && input.databaseName === input.liveDatabaseName) {
      throw new Error('Refusing to apply the test review sheet to the live database');
    }
    return;
  }

  if (!input.confirmLive) {
    throw new Error('Live review import requires --confirm-live');
  }
  if (!input.liveDatabaseName || input.liveDatabaseName !== input.databaseName) {
    throw new Error(
      'REVIEW_IMPORT_LIVE_DATABASE must equal the database name in DATABASE_URL before any insert',
    );
  }
}

export function classifyImportInsert(returnedId: string | null | undefined): 'created' | 'duplicate' {
  return returnedId ? 'created' : 'duplicate';
}
