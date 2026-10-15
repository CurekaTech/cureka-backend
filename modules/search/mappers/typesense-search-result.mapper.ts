import {
  SEARCH_ENTITY_TYPES,
  SearchEntityType,
} from '../constants/search-entity-type.constant';
import { IPublicSearchResult } from '../interfaces/public-search-result.interface';
import { compactSearchText, isCloseSearchMatch } from '../utils/search-tolerance.util';
import { normalizeSearchQuery, searchQueryTerms } from '../utils/search-query.util';

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
  const productPageUrlRaw = String(document.productPageUrl ?? '').trim();
  const productPageUrl = productPageUrlRaw || null;
  const permalinkRaw = String(document.permalink ?? '').trim();
  const permalink = permalinkRaw || null;
  const entityType = parseEntityType(document.entityType);

  if (!refId || !name || !slug) {
    return null;
  }

  return {
    entityType,
    title: name,
    slug,
    refId,
    productPageUrl,
    ...(permalink ? { permalink } : {}),
    ...(entityType === SEARCH_ENTITY_TYPES.PRODUCT && permalink
      ? { product: { permalink } }
      : {}),
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
  const normalizedQuery = normalizeSearchText(normalizeSearchQuery(query));
  if (!normalizedQuery) {
    return true;
  }
  if (normalizedTitle.includes(normalizedQuery)) {
    return true;
  }

  const tokens = searchQueryTerms(query).map(normalizeSearchText);

  return tokens.length > 0 && tokens.some((token) => normalizedTitle.includes(token));
}

/**
 * Same distinct-title rules as the strict filter, but also keeps a hit whose
 * title is a close typo or space-stripped match. Used only after the strict
 * filter returns nothing.
 */
export function filterDistinctTolerantProductVariants(
  results: IPublicSearchResult[],
  searchQuery: string,
): IPublicSearchResult[] {
  const query = searchQuery.trim();
  const compactQuery = compactSearchText(query);
  return filterDistinctMatchingProductVariants(results, query, (title) => {
    if (titleMatchesSearchQuery(title, query)) return true;
    if (compactQuery && titleMatchesSearchQuery(title, compactQuery)) return true;
    return isCloseSearchMatch(title, query);
  });
}

export function filterDistinctMatchingProductVariants(
  results: IPublicSearchResult[],
  searchQuery?: string,
  acceptTitle?: (title: string) => boolean,
): IPublicSearchResult[] {
  const query = searchQuery?.trim() ?? '';
  const seenTitles = new Set<string>();
  const seenRefTitleKeys = new Set<string>();
  const filtered: IPublicSearchResult[] = [];

  for (const result of results) {
    if (result.entityType === SEARCH_ENTITY_TYPES.PRODUCT) {
      const accepted = acceptTitle
        ? acceptTitle(result.title)
        : !query || titleMatchesSearchQuery(result.title, query);
      if (!accepted) {
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
