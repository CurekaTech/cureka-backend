import {
  SEARCH_ENTITY_TYPES,
  SearchEntityType,
} from '../constants/search-entity-type.constant';
import { IPublicSearchResult } from '../interfaces/public-search-result.interface';
import { ITypesenseSearchDocument } from '../interfaces/typesense-search-document.interface';

const SEARCH_ENTITY_TYPE_VALUES = new Set<string>(Object.values(SEARCH_ENTITY_TYPES));

function parseEntityType(value: unknown): SearchEntityType {
  const normalized = String(value ?? '').trim();
  if (SEARCH_ENTITY_TYPE_VALUES.has(normalized)) {
    return normalized as SearchEntityType;
  }

  return SEARCH_ENTITY_TYPES.PRODUCT;
}

export function mapTypesenseDocumentToSearchResult(
  document: Record<string, unknown>,
): IPublicSearchResult | null {
  const refId = String(document.refId ?? document.id ?? '').trim();
  const name = String(document.name ?? '').trim();
  const variantSlug = String(document.variantSlug ?? '').trim();
  const slug = variantSlug || String(document.slug ?? '').trim();
  const variantId = String(document.variantId ?? '').trim() || undefined;
  const productPageUrlRaw = String(document.productPageUrl ?? '').trim();
  const productPageUrl = productPageUrlRaw || null;

  if (!refId || !name || !slug) {
    return null;
  }

  return {
    entityType: parseEntityType(document.entityType),
    title: name,
    slug,
    refId,
    variantId,
    productPageUrl,
  };
}

export function mapTypesenseDocumentsToSearchResults(
  documents: Array<Record<string, unknown>>,
): IPublicSearchResult[] {
  return documents
    .map((document) => mapTypesenseDocumentToSearchResult(document))
    .filter((result): result is IPublicSearchResult => Boolean(result));
}

export function mapTypesenseHitsToSearchResults(
  hits: Array<{ document?: Record<string, unknown> }>,
): IPublicSearchResult[] {
  const documents = hits
    .map((hit) => hit.document)
    .filter((document): document is Record<string, unknown> => Boolean(document));

  return mapTypesenseDocumentsToSearchResults(documents);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Case-insensitive contains match (ILIKE '%query%'), ignoring spaces/punctuation. */
export function titleMatchesSearchQuery(title: string, query: string): boolean {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }
  if (normalizedTitle.includes(normalizedQuery)) {
    return true;
  }

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]+/g, ''))
    .filter((token) => token.length > 1);

  return tokens.length > 0 && tokens.every((token) => normalizedTitle.includes(token));
}

/**
 * Keep variant-level Product hits, but:
 * - only when the variant/product title matches the search query (ILIKE-style)
 * - collapse identical titles (same product twice, or duplicate catalog rows with different refIds)
 * - keep different variants when their titles differ
 */
export function filterDistinctMatchingProductVariants(
  results: IPublicSearchResult[],
  searchQuery?: string,
): IPublicSearchResult[] {
  const query = searchQuery?.trim() ?? '';
  const seenTitles = new Set<string>();
  const seenRefTitleKeys = new Set<string>();
  const filtered: IPublicSearchResult[] = [];

  for (const result of results) {
    if (result.entityType === SEARCH_ENTITY_TYPES.PRODUCT) {
      if (query && !titleMatchesSearchQuery(result.title, query)) {
        continue;
      }

      const normalizedTitle = normalizeSearchText(result.title);
      const refTitleKey = `${result.refId}\0${normalizedTitle}`;

      // Prefer first Typesense hit when duplicate products share the same title.
      if (normalizedTitle && seenTitles.has(normalizedTitle)) {
        continue;
      }
      if (seenRefTitleKeys.has(refTitleKey)) {
        continue;
      }

      if (normalizedTitle) {
        seenTitles.add(normalizedTitle);
      }
      seenRefTitleKeys.add(refTitleKey);
    }

    filtered.push(result);
  }

  return filtered;
}
