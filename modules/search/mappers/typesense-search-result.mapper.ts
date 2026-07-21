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

  if (!refId || !name || !slug) {
    return null;
  }

  return {
    entityType: parseEntityType(document.entityType),
    title: name,
    slug,
    refId,
    variantId,
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
