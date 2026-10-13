import { ProductStatus } from '../enums/product-status.enum';
import { resolveProductAuditAction } from './product-audit-action.util';

describe('resolveProductAuditAction', () => {
  it('records publish and unpublish as their own actions', () => {
    expect(resolveProductAuditAction(ProductStatus.DRAFT, ProductStatus.PUBLISHED)).toBe('published');
    expect(resolveProductAuditAction(ProductStatus.PUBLISHED, ProductStatus.INACTIVE)).toBe('unpublished');
    expect(resolveProductAuditAction(ProductStatus.PUBLISHED, ProductStatus.ARCHIVED)).toBe('unpublished');
  });

  it('keeps review transitions distinct from publish', () => {
    expect(resolveProductAuditAction(ProductStatus.DRAFT, ProductStatus.PENDING_REVIEW)).toBe(
      'submitted_for_review',
    );
    expect(resolveProductAuditAction(ProductStatus.PENDING_REVIEW, ProductStatus.REJECTED)).toBe('rejected');
    expect(resolveProductAuditAction(ProductStatus.REJECTED, ProductStatus.DRAFT)).toBe('status_changed');
  });
});
