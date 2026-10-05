/** Stored page lifecycle. Expired is also derived at read time when `endAt` has passed. */
export enum PromotionalPageStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  UNPUBLISHED = 'unpublished',
  EXPIRED = 'expired',
  ARCHIVED = 'archived',
}
