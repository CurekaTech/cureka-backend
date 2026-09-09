import { RefundRequestStatus } from '../enums/refund-request-status.enum';

const ALLOWED: Record<RefundRequestStatus, RefundRequestStatus[]> = {
  [RefundRequestStatus.REQUESTED]: [
    RefundRequestStatus.UNDER_REVIEW,
    RefundRequestStatus.AWAITING_APPROVAL,
    RefundRequestStatus.APPROVED,
    RefundRequestStatus.REJECTED,
    RefundRequestStatus.CANCELLED,
  ],
  [RefundRequestStatus.UNDER_REVIEW]: [
    RefundRequestStatus.AWAITING_APPROVAL,
    RefundRequestStatus.APPROVED,
    RefundRequestStatus.REJECTED,
    RefundRequestStatus.CANCELLED,
  ],
  [RefundRequestStatus.AWAITING_APPROVAL]: [
    RefundRequestStatus.APPROVED,
    RefundRequestStatus.REJECTED,
  ],
  [RefundRequestStatus.APPROVED]: [
    RefundRequestStatus.FINANCE_PROCESSING,
    RefundRequestStatus.PROCESSING,
  ],
  [RefundRequestStatus.FINANCE_PROCESSING]: [RefundRequestStatus.PROCESSING],
  [RefundRequestStatus.PROCESSING]: [
    RefundRequestStatus.PROCESSED,
    RefundRequestStatus.FAILED,
  ],
  [RefundRequestStatus.FAILED]: [RefundRequestStatus.PROCESSING],
  [RefundRequestStatus.PROCESSED]: [RefundRequestStatus.CLOSED],
  [RefundRequestStatus.REJECTED]: [],
  [RefundRequestStatus.CANCELLED]: [],
  [RefundRequestStatus.CLOSED]: [],
};

export function canTransitionRefundStatus(
  from: RefundRequestStatus,
  to: RefundRequestStatus,
): boolean {
  if (from === to) {
    return true;
  }
  return ALLOWED[from]?.includes(to) ?? false;
}

export function isTerminalRefundStatus(status: RefundRequestStatus): boolean {
  return (
    status === RefundRequestStatus.REJECTED ||
    status === RefundRequestStatus.CANCELLED ||
    status === RefundRequestStatus.CLOSED
  );
}

export function isActiveRefundStatus(status: RefundRequestStatus): boolean {
  return !isTerminalRefundStatus(status);
}

export function isInitiatableRefundStatus(status: RefundRequestStatus): boolean {
  return (
    status === RefundRequestStatus.APPROVED ||
    status === RefundRequestStatus.FINANCE_PROCESSING
  );
}
