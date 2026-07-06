export const TYPESENSE_DOCUMENT_ID_PREFIX = {
  CATEGORY: 'category',
  BRAND: 'brand',
  HEALTH_CONCERN: 'health-concern',
} as const;

export function buildCategoryDocumentId(refId: string): string {
  return `${TYPESENSE_DOCUMENT_ID_PREFIX.CATEGORY}:${refId}`;
}

export function buildBrandDocumentId(refId: string): string {
  return `${TYPESENSE_DOCUMENT_ID_PREFIX.BRAND}:${refId}`;
}

export function buildHealthConcernDocumentId(refId: string): string {
  return `${TYPESENSE_DOCUMENT_ID_PREFIX.HEALTH_CONCERN}:${refId}`;
}

export function buildProductDocumentId(refId: string): string {
  return refId;
}
