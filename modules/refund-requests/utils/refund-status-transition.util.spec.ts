import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { canTransitionRefundStatus, isInitiatableRefundStatus } from './refund-status-transition.util';

describe('refund status transitions', () => {
  it('allows review and approval from REQUESTED', () => {
    expect(canTransitionRefundStatus(RefundRequestStatus.REQUESTED, RefundRequestStatus.UNDER_REVIEW)).toBe(true);
    expect(canTransitionRefundStatus(RefundRequestStatus.REQUESTED, RefundRequestStatus.APPROVED)).toBe(true);
  });

  it('does not allow initiation from REQUESTED', () => {
    expect(isInitiatableRefundStatus(RefundRequestStatus.REQUESTED)).toBe(false);
    expect(isInitiatableRefundStatus(RefundRequestStatus.APPROVED)).toBe(true);
  });

  it('rejects processing a rejected request', () => {
    expect(canTransitionRefundStatus(RefundRequestStatus.REJECTED, RefundRequestStatus.PROCESSING)).toBe(false);
    expect(canTransitionRefundStatus(RefundRequestStatus.CANCELLED, RefundRequestStatus.PROCESSING)).toBe(false);
  });

  it('does not allow a processed refund to be initiated again', () => {
    expect(canTransitionRefundStatus(RefundRequestStatus.PROCESSED, RefundRequestStatus.PROCESSING)).toBe(false);
    expect(isInitiatableRefundStatus(RefundRequestStatus.PROCESSED)).toBe(false);
  });

  it('allows rejection from REQUESTED', () => {
    expect(canTransitionRefundStatus(RefundRequestStatus.REQUESTED, RefundRequestStatus.REJECTED)).toBe(true);
  });
});
