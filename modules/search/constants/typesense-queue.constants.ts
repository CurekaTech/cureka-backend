export const TYPESENSE_JOB_NAMES = {
  REINDEX_CATEGORY: 'reindex-category',
  REINDEX_BRAND: 'reindex-brand',
} as const;

export interface TypesenseReindexJobData {
  refId: string;
}
