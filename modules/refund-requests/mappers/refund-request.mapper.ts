import {
  REFUND_CREDIT_WINDOW_MESSAGE,
  REFUND_REQUEST_INITIATED_CUSTOMER_MESSAGE,
  REFUND_SLA_ORANGE_AFTER_HOURS,
  REFUND_SLA_RED_AFTER_HOURS,
} from '../constants/refund-request.constants';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { RefundRequestHistoryEntity } from '../entities/refund-request-history.entity';
import { RefundRequestEntity } from '../entities/refund-request.entity';
import {
  CustomerRefundDisplayStatus,
  ICustomerRefundView,
  IRefundAvailableAction,
  IRefundRequestDetail,
  IRefundRequestHistoryItem,
  IRefundRequestListItem,
  IRefundableAmountBreakdown,
  RefundSlaStatus,
} from '../interfaces/refund-request.interface';

export function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      added += 1;
    }
  }
  return result;
}

export function computeRefundAgeHours(createdAt: Date, now = new Date()): number {
  return Math.max(0, (now.getTime() - createdAt.getTime()) / 36e5);
}

export function computeRefundSlaStatus(createdAt: Date, now = new Date()): RefundSlaStatus {
  const hours = computeRefundAgeHours(createdAt, now);
  if (hours >= REFUND_SLA_RED_AFTER_HOURS) {
    return 'RED';
  }
  if (hours >= REFUND_SLA_ORANGE_AFTER_HOURS) {
    return 'ORANGE';
  }
  return 'GREEN';
}

export function toCustomerDisplayStatus(status: RefundRequestStatus): CustomerRefundDisplayStatus {
  switch (status) {
    case RefundRequestStatus.APPROVED:
    case RefundRequestStatus.FINANCE_PROCESSING:
      return 'Refund approved';
    case RefundRequestStatus.PROCESSING:
      return 'Refund processing';
    case RefundRequestStatus.PROCESSED:
    case RefundRequestStatus.CLOSED:
      return 'Refund processed';
    case RefundRequestStatus.FAILED:
      return 'Refund failed. Please contact support.';
    case RefundRequestStatus.REJECTED:
      return 'Refund request declined';
    case RefundRequestStatus.CANCELLED:
      return 'Refund request cancelled';
    default:
      return 'Refund request initiated';
  }
}

function customerName(entity: RefundRequestEntity): string | null {
  const first = entity.customer?.firstName?.trim() ?? '';
  const last = entity.customer?.lastName?.trim() ?? '';
  const name = `${first} ${last}`.trim();
  return name || null;
}

function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function mapRefundHistory(entity: RefundRequestHistoryEntity): IRefundRequestHistoryItem {
  return {
    id: entity.id,
    fromStatus: entity.fromStatus,
    toStatus: entity.toStatus,
    action: entity.action,
    comment: entity.comment,
    performedBy: entity.performedBy,
    performedByRole: entity.performedByRole,
    metadata: entity.metadata,
    createdAt: entity.createdAt,
  };
}

export function mapRefundRequestToListItem(
  entity: RefundRequestEntity,
  now = new Date(),
): IRefundRequestListItem {
  const ageInHours = computeRefundAgeHours(entity.createdAt, now);
  return {
    id: entity.id,
    refId: entity.refId,
    orderId: entity.orderId,
    orderNumber: entity.orderNumber,
    customer: {
      id: entity.customerId,
      name: customerName(entity),
      mobileNumber: entity.customer?.mobileNumber ?? null,
      email: maskEmail(entity.customer?.email),
    },
    reason: entity.reason,
    requestedAmount: entity.requestedAmount,
    approvedAmount: entity.approvedAmount,
    currency: entity.currency,
    status: entity.status,
    originalPaymentMethod: entity.originalPaymentMethod,
    paymentProvider: entity.paymentProvider,
    providerRefundId: entity.providerRefundId,
    requestedByType: entity.requestedByType,
    assignedToUserId: entity.assignedToUserId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    ageInHours: Math.round(ageInHours * 10) / 10,
    ageInDays: Math.floor(ageInHours / 24),
    slaStatus: computeRefundSlaStatus(entity.createdAt, now),
    expectedCreditFrom: entity.expectedCreditFrom,
    expectedCreditTo: entity.expectedCreditTo,
  };
}

export function mapRefundRequestToDetail(
  entity: RefundRequestEntity,
  refundable: IRefundableAmountBreakdown,
  availableActions: IRefundAvailableAction[],
): IRefundRequestDetail {
  const history = [...(entity.history ?? [])].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  return {
    ...mapRefundRequestToListItem(entity),
    reasonDetails: entity.reasonDetails,
    rejectionReason: entity.rejectionReason,
    merchantRefundReference: entity.merchantRefundReference,
    providerPaymentId: entity.providerPaymentId,
    providerRefundStatus: entity.providerRefundStatus,
    paymentRequestId: entity.paymentRequestId,
    reviewedBy: entity.reviewedBy,
    reviewedAt: entity.reviewedAt,
    approvedBy: entity.approvedBy,
    approvedAt: entity.approvedAt,
    rejectedBy: entity.rejectedBy,
    rejectedAt: entity.rejectedAt,
    processingStartedBy: entity.processingStartedBy,
    processingStartedAt: entity.processingStartedAt,
    processedAt: entity.processedAt,
    failedAt: entity.failedAt,
    failureCode: entity.failureCode,
    failureMessage: entity.failureMessage,
    refundable,
    history: history.map(mapRefundHistory),
    availableActions,
  };
}

export function mapCustomerRefundView(entity: RefundRequestEntity): ICustomerRefundView {
  const initiated = entity.status === RefundRequestStatus.REQUESTED
    || entity.status === RefundRequestStatus.UNDER_REVIEW
    || entity.status === RefundRequestStatus.AWAITING_APPROVAL;
  return {
    id: entity.id,
    refId: entity.refId,
    status: entity.status,
    displayStatus: toCustomerDisplayStatus(entity.status),
    amount: entity.approvedAmount ?? entity.requestedAmount,
    currency: entity.currency,
    requestedAt: entity.createdAt,
    processedAt: entity.processedAt,
    expectedCreditMessage: REFUND_CREDIT_WINDOW_MESSAGE,
    message: initiated
      ? REFUND_REQUEST_INITIATED_CUSTOMER_MESSAGE
      : REFUND_CREDIT_WINDOW_MESSAGE,
  };
}

export function buildAvailableActions(status: RefundRequestStatus): IRefundAvailableAction[] {
  const actions: IRefundAvailableAction[] = [
    {
      action: 'review',
      allowed:
        status === RefundRequestStatus.REQUESTED || status === RefundRequestStatus.UNDER_REVIEW,
      requiredPermission: 'refund_requests.update',
    },
    {
      action: 'approve',
      allowed: [
        RefundRequestStatus.REQUESTED,
        RefundRequestStatus.UNDER_REVIEW,
        RefundRequestStatus.AWAITING_APPROVAL,
      ].includes(status),
      requiredPermission: 'refund_requests.approve',
    },
    {
      action: 'reject',
      allowed: [
        RefundRequestStatus.REQUESTED,
        RefundRequestStatus.UNDER_REVIEW,
        RefundRequestStatus.AWAITING_APPROVAL,
      ].includes(status),
      requiredPermission: 'refund_requests.reject',
    },
    {
      action: 'assign',
      allowed: true,
      requiredPermission: 'refund_requests.update',
    },
    {
      action: 'comment',
      allowed: true,
      requiredPermission: 'refund_requests.update',
    },
    {
      action: 'initiate',
      allowed:
        status === RefundRequestStatus.APPROVED ||
        status === RefundRequestStatus.FINANCE_PROCESSING,
      requiredPermission: 'refund_requests.status',
    },
    {
      action: 'retry',
      allowed: status === RefundRequestStatus.FAILED,
      requiredPermission: 'refund_requests.status',
    },
    {
      action: 'reconcile',
      allowed:
        status === RefundRequestStatus.PROCESSING || status === RefundRequestStatus.FAILED,
      requiredPermission: 'refund_requests.status',
    },
  ];
  return actions;
}
