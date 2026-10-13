import { ProductStatus } from '../enums/product-status.enum';

/** Map a real status change to the action stored on audit_logs. */
export function resolveProductAuditAction(from: ProductStatus, to: ProductStatus): string {
  if (to === ProductStatus.PUBLISHED) return 'published';
  if (to === ProductStatus.REJECTED) return 'rejected';
  if (to === ProductStatus.PENDING_REVIEW) return 'submitted_for_review';
  if (from === ProductStatus.PUBLISHED) return 'unpublished';
  return 'status_changed';
}
