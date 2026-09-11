import { IStorageFileReferenceResponse } from '@packages/storage';
import { RETURN_PERMISSIONS } from '../constants/return-permissions.constants';
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  RETURN_SLA_ORANGE_AFTER_HOURS,
  RETURN_SLA_RED_AFTER_HOURS,
} from '../constants/return.constants';
import { ReturnStatus } from '../enums/return-status.enum';
import { ReturnEvidenceEntity } from '../entities/return-evidence.entity';
import { ReturnPickupEntity } from '../entities/return-pickup.entity';
import { ReturnQcRecordEntity } from '../entities/return-qc-record.entity';
import { ReturnRequestItemEntity } from '../entities/return-request-item.entity';
import { ReturnRequestEntity } from '../entities/return-request.entity';
import { ReturnStatusHistoryEntity } from '../entities/return-status-history.entity';
import {
  ICustomerReturnDetail,
  ICustomerReturnListItem,
  IReturnAdminTimelineEntry,
  IReturnAvailableAction,
  IReturnEvidenceView,
  IReturnPickupView,
  IReturnQcView,
  IReturnRefundLinkView,
  IReturnRequestDetail,
  IReturnRequestItemView,
  IReturnRequestListItem,
  IReturnTimelineEntry,
  ReturnSlaStatus,
} from '../interfaces/return-request.interface';

export const computeReturnAgeHours = (createdAt: Date, now = new Date()): number =>
  Math.max(0, (now.getTime() - createdAt.getTime()) / 36e5);

export const computeReturnSlaStatus = (createdAt: Date, now = new Date()): ReturnSlaStatus => {
  const hours = computeReturnAgeHours(createdAt, now);
  if (hours >= RETURN_SLA_RED_AFTER_HOURS) return 'RED';
  if (hours >= RETURN_SLA_ORANGE_AFTER_HOURS) return 'ORANGE';
  return 'GREEN';
};

/** Plain-language status shown to the customer; never leaks internal workflow terms. */
export const toCustomerDisplayStatus = (status: ReturnStatus): string => {
  switch (status) {
    case ReturnStatus.REQUESTED:
    case ReturnStatus.UNDER_REVIEW:
      return 'Return request under review';
    case ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED:
      return 'More information needed';
    case ReturnStatus.APPROVED:
      return 'Return approved';
    case ReturnStatus.PICKUP_SCHEDULED:
      return 'Pickup scheduled';
    case ReturnStatus.PICKUP_ATTEMPTED:
      return 'Pickup attempted';
    case ReturnStatus.PICKED_UP:
    case ReturnStatus.IN_TRANSIT_TO_WAREHOUSE:
      return 'Item picked up';
    case ReturnStatus.RECEIVED_AT_WAREHOUSE:
    case ReturnStatus.QC_PENDING:
      return 'Item received, quality check in progress';
    case ReturnStatus.QC_PASSED:
      return 'Quality check passed';
    case ReturnStatus.QC_FAILED:
      return 'Quality check not passed';
    case ReturnStatus.REFUND_PENDING:
      return 'Refund pending';
    case ReturnStatus.REFUND_INITIATED:
      return 'Refund initiated';
    case ReturnStatus.REFUND_COMPLETED:
      return 'Refund completed';
    case ReturnStatus.REPLACEMENT_PENDING:
      return 'Replacement pending';
    case ReturnStatus.REPLACEMENT_CREATED:
      return 'Replacement order created';
    case ReturnStatus.COMPLETED:
      return 'Return completed';
    case ReturnStatus.REJECTED:
      return 'Return request declined';
    case ReturnStatus.CANCELLED_BY_CUSTOMER:
      return 'Return request cancelled';
    default:
      return 'Return request under review';
  }
};

const customerName = (entity: ReturnRequestEntity): string | null => {
  const first = entity.customer?.firstName?.trim() ?? '';
  const last = entity.customer?.lastName?.trim() ?? '';
  return `${first} ${last}`.trim() || null;
};

const maskEmail = (email?: string | null): string | null => {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
};

export const mapReturnItem = (entity: ReturnRequestItemEntity): IReturnRequestItemView => ({
  id: entity.id,
  orderItemId: entity.orderItemId,
  productId: entity.productId,
  variantId: entity.variantId,
  sku: entity.sku,
  productName: entity.productName,
  variantName: entity.variantName,
  quantity: entity.quantity,
  unitPrice: entity.unitPrice,
  refundableAmount: entity.refundableAmount,
  deliveredAt: entity.deliveredAt,
  acceptedQuantity: entity.acceptedQuantity,
  rejectedQuantity: entity.rejectedQuantity,
  qcRejectionReason: entity.qcRejectionReason,
  replacementVariantId: entity.replacementVariantId,
  replacementSku: entity.replacementSku,
  policySnapshot: entity.policySnapshot,
});

export const mapReturnEvidence = (entity: ReturnEvidenceEntity): IReturnEvidenceView => ({
  id: entity.id,
  returnRequestItemId: entity.returnRequestItemId,
  mediaType: entity.mediaType,
  source: entity.source,
  // Enriched to a signed URL by StorageUrlEnricher before the response leaves the service.
  file: entity.file as unknown as IStorageFileReferenceResponse | null,
  originalFilename: entity.originalFilename,
  createdAt: entity.createdAt,
});

export const mapReturnPickup = (entity: ReturnPickupEntity): IReturnPickupView => ({
  id: entity.id,
  provider: entity.provider,
  status: entity.status,
  providerPickupId: entity.providerPickupId,
  reverseAwbNumber: entity.reverseAwbNumber,
  courierName: entity.courierName,
  trackingUrl: entity.trackingUrl,
  scheduledAt: entity.scheduledAt,
  pickedUpAt: entity.pickedUpAt,
  deliveredAtWarehouseAt: entity.deliveredAtWarehouseAt,
  attemptCount: entity.attemptCount,
  lastEventAt: entity.lastEventAt,
  lastEventStatus: entity.lastEventStatus,
  failureReason: entity.failureReason,
  unicommerceReversePickupCode:
    typeof entity.providerPayload?.['unicommerceReversePickupCode'] === 'string'
      ? (entity.providerPayload['unicommerceReversePickupCode'] as string)
      : null,
  shipwayOrderId:
    typeof entity.providerPayload?.['shipwayOrderId'] === 'string'
      ? (entity.providerPayload['shipwayOrderId'] as string)
      : entity.provider === 'SHIPWAY'
        ? entity.providerPickupId
        : null,
});

export const mapReturnQcRecord = (entity: ReturnQcRecordEntity): IReturnQcView => ({
  id: entity.id,
  returnRequestItemId: entity.returnRequestItemId,
  result: entity.result,
  receivedQuantity: entity.receivedQuantity,
  acceptedQuantity: entity.acceptedQuantity,
  rejectedQuantity: entity.rejectedQuantity,
  rejectionReason: entity.rejectionReason,
  notes: entity.notes,
  performedBy: entity.performedBy,
  performedAt: entity.performedAt,
});

export const mapAdminTimelineEntry = (
  entity: ReturnStatusHistoryEntity,
): IReturnAdminTimelineEntry => ({
  id: entity.id,
  fromStatus: entity.fromStatus,
  toStatus: entity.toStatus,
  action: entity.action,
  comment: entity.comment,
  createdAt: entity.createdAt,
  isCustomerVisible: entity.isCustomerVisible,
  performedBy: entity.performedBy,
  performedByRole: entity.performedByRole,
  metadata: entity.metadata,
});

/** Drops internal actors, metadata and non-customer-visible entries. */
export const mapCustomerTimelineEntry = (
  entity: ReturnStatusHistoryEntity,
): IReturnTimelineEntry => ({
  id: entity.id,
  fromStatus: entity.fromStatus,
  toStatus: entity.toStatus,
  action: entity.action,
  comment: entity.comment,
  createdAt: entity.createdAt,
});

export const mapReturnToListItem = (
  entity: ReturnRequestEntity,
  now = new Date(),
): IReturnRequestListItem => {
  const items = entity.items ?? [];
  return {
    id: entity.id,
    refId: entity.refId,
    returnNumber: entity.returnNumber,
    orderId: entity.orderId,
    orderNumber: entity.orderNumber,
    customer: {
      id: entity.customerId,
      name: customerName(entity),
      mobileNumber: entity.customer?.mobileNumber ?? null,
      email: maskEmail(entity.customer?.email),
    },
    status: entity.status,
    resolution: entity.resolution,
    reasonCode: entity.reasonCode,
    reasonTitle: entity.reasonTitle,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    estimatedRefundAmount: entity.estimatedRefundAmount,
    approvedRefundAmount: entity.approvedRefundAmount,
    currency: entity.currency,
    pickupRequired: entity.pickupRequired,
    qcRequired: entity.qcRequired,
    isAdminInitiated: entity.isAdminInitiated,
    assignedToUserId: entity.assignedToUserId,
    deliveredAt: entity.deliveredAt,
    returnWindowExpiresAt: entity.returnWindowExpiresAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    ageInHours: Math.round(computeReturnAgeHours(entity.createdAt, now) * 10) / 10,
    slaStatus: computeReturnSlaStatus(entity.createdAt, now),
    skus: items.map((item) => item.sku),
  };
};

export const mapCustomerReturnListItem = (
  entity: ReturnRequestEntity,
): ICustomerReturnListItem => {
  const items = entity.items ?? [];
  return {
    id: entity.id,
    returnNumber: entity.returnNumber,
    orderId: entity.orderId,
    orderNumber: entity.orderNumber,
    status: entity.status,
    displayStatus: toCustomerDisplayStatus(entity.status),
    resolution: entity.resolution,
    reasonTitle: entity.reasonTitle,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    estimatedRefundAmount: entity.estimatedRefundAmount,
    approvedRefundAmount: entity.approvedRefundAmount,
    currency: entity.currency,
    canCancel: isCustomerCancellable(entity.status),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
};

export const mapReturnToDetail = (
  entity: ReturnRequestEntity,
  extras: {
    evidence: ReturnEvidenceEntity[];
    pickups: ReturnPickupEntity[];
    qcRecords: ReturnQcRecordEntity[];
    refund: IReturnRefundLinkView;
  },
): IReturnRequestDetail => {
  const history = [...(entity.history ?? [])].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );

  return {
    ...mapReturnToListItem(entity),
    customerComments: entity.customerComments,
    conditionDeclarations: entity.conditionDeclarations,
    isExpiredProductClaim: entity.isExpiredProductClaim,
    eligibilityOverridden: entity.eligibilityOverridden,
    overrideReason: entity.overrideReason,
    internalJustification: entity.internalJustification,
    customerVisibleExplanation: entity.customerVisibleExplanation,
    eligibilitySnapshot: entity.eligibilitySnapshot,
    pickupAddress: entity.pickupAddress,
    rejectionReason: entity.rejectionReason,
    informationRequestMessage: entity.informationRequestMessage,
    informationRequestedAt: entity.informationRequestedAt,
    reviewedBy: entity.reviewedBy,
    reviewedAt: entity.reviewedAt,
    approvedBy: entity.approvedBy,
    approvedAt: entity.approvedAt,
    rejectedBy: entity.rejectedBy,
    rejectedAt: entity.rejectedAt,
    pickedUpAt: entity.pickedUpAt,
    receivedAtWarehouseAt: entity.receivedAtWarehouseAt,
    qcCompletedAt: entity.qcCompletedAt,
    noPickupApproved: entity.noPickupApproved,
    completedAt: entity.completedAt,
    cancelledAt: entity.cancelledAt,
    amountBreakdown: entity.amountBreakdown,
    items: (entity.items ?? []).map(mapReturnItem),
    evidence: extras.evidence.map(mapReturnEvidence),
    pickups: extras.pickups.map(mapReturnPickup),
    qcRecords: extras.qcRecords.map(mapReturnQcRecord),
    refund: extras.refund,
    replacement: {
      replacementOrderId: entity.replacementOrderId,
      linkedAt: entity.replacementLinkedAt,
    },
    codRefund: entity.refundMethod
      ? {
          method: entity.refundMethod,
          bankDetails:
            entity.refundMethod === 'BANK_ACCOUNT' ? mapMaskedReturnBankDetails(entity) : null,
        }
      : null,
    timeline: history.map(mapAdminTimelineEntry),
    availableActions: buildAvailableActions(entity),
  };
};

export const mapCustomerReturnDetail = (
  entity: ReturnRequestEntity,
  extras: {
    evidence: ReturnEvidenceEntity[];
    pickup: ReturnPickupEntity | null;
    refund: { status: string | null; amount: string | null; message: string | null };
  },
): ICustomerReturnDetail => {
  const history = [...(entity.history ?? [])]
    .filter((entry) => entry.isCustomerVisible)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

  const outcomeMessage =
    entity.status === ReturnStatus.REJECTED
      ? entity.rejectionReason
      : entity.customerVisibleExplanation;

  return {
    id: entity.id,
    returnNumber: entity.returnNumber,
    orderId: entity.orderId,
    orderNumber: entity.orderNumber,
    status: entity.status,
    displayStatus: toCustomerDisplayStatus(entity.status),
    resolution: entity.resolution,
    reasonTitle: entity.reasonTitle,
    customerComments: entity.customerComments,
    estimatedRefundAmount: entity.estimatedRefundAmount,
    approvedRefundAmount: entity.approvedRefundAmount,
    currency: entity.currency,
    pickupRequired: entity.pickupRequired,
    pickupAddress: entity.pickupAddress,
    deliveredAt: entity.deliveredAt,
    returnWindowExpiresAt: entity.returnWindowExpiresAt,
    createdAt: entity.createdAt,
    outcomeMessage: outcomeMessage ?? null,
    informationRequestMessage:
      entity.status === ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED
        ? entity.informationRequestMessage
        : null,
    canCancel: isCustomerCancellable(entity.status),
    canSubmitAdditionalInformation:
      entity.status === ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED,
    items: (entity.items ?? []).map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      sku: item.sku,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      refundableAmount: item.refundableAmount,
      acceptedQuantity: item.acceptedQuantity,
      rejectedQuantity: item.rejectedQuantity,
      imageUrl: null,
    })),
    evidence: extras.evidence.map(mapReturnEvidence),
    tracking: extras.pickup
      ? {
          reverseAwbNumber: extras.pickup.reverseAwbNumber,
          courierName: extras.pickup.courierName,
          trackingUrl: extras.pickup.trackingUrl,
          status: extras.pickup.status,
          scheduledAt: extras.pickup.scheduledAt,
          pickedUpAt: extras.pickup.pickedUpAt,
        }
      : null,
    refund: extras.refund,
    timeline: history.map(mapCustomerTimelineEntry),
    codRefund: entity.refundMethod
      ? {
          method: entity.refundMethod,
          payoutStatus: extras.refund.status,
          bankDetails:
            entity.refundMethod === 'BANK_ACCOUNT' ? mapMaskedReturnBankDetails(entity) : null,
          customerMessage:
            'Your refund request has been initiated. It may take 5–7 working days after approval.',
          canUpdateBankDetails: isCustomerCancellable(entity.status) && !entity.bankDetailsLocked,
        }
      : null,
  };
};

export const isCustomerCancellable = (status: ReturnStatus): boolean =>
  (CUSTOMER_CANCELLABLE_STATUSES as readonly string[]).includes(status);

export const mapMaskedReturnBankDetails = (entity: ReturnRequestEntity) => ({
  accountHolderName: entity.bankAccountHolderName,
  accountNumberMasked: entity.bankAccountNumberLast4
    ? `XXXXXX${entity.bankAccountNumberLast4}`
    : null,
  ifsc: entity.bankIfsc,
  bankName: entity.bankName,
  locked: entity.bankDetailsLocked,
});

export const buildAvailableActions = (entity: ReturnRequestEntity): IReturnAvailableAction[] => {
  const status = entity.status;
  const inReview = [
    ReturnStatus.REQUESTED,
    ReturnStatus.UNDER_REVIEW,
    ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED,
  ].includes(status);

  return [
    {
      action: 'review',
      allowed: status === ReturnStatus.REQUESTED || status === ReturnStatus.UNDER_REVIEW,
      requiredPermission: RETURN_PERMISSIONS.UPDATE,
    },
    { action: 'approve', allowed: inReview, requiredPermission: RETURN_PERMISSIONS.APPROVE },
    { action: 'reject', allowed: inReview, requiredPermission: RETURN_PERMISSIONS.REJECT },
    {
      action: 'requestInformation',
      allowed: status === ReturnStatus.REQUESTED || status === ReturnStatus.UNDER_REVIEW,
      requiredPermission: RETURN_PERMISSIONS.UPDATE,
    },
    { action: 'assign', allowed: true, requiredPermission: RETURN_PERMISSIONS.UPDATE },
    { action: 'comment', allowed: true, requiredPermission: RETURN_PERMISSIONS.UPDATE },
    {
      action: 'schedulePickup',
      allowed: entity.pickupRequired && status === ReturnStatus.APPROVED,
      requiredPermission: RETURN_PERMISSIONS.STATUS,
    },
    {
      action: 'updatePickup',
      allowed: [
        ReturnStatus.PICKUP_SCHEDULED,
        ReturnStatus.PICKUP_ATTEMPTED,
        ReturnStatus.PICKED_UP,
        ReturnStatus.IN_TRANSIT_TO_WAREHOUSE,
      ].includes(status),
      requiredPermission: RETURN_PERMISSIONS.STATUS,
    },
    {
      action: 'approveNoPickup',
      allowed: entity.pickupRequired && status === ReturnStatus.APPROVED,
      requiredPermission: RETURN_PERMISSIONS.APPROVE,
    },
    {
      action: 'receiveAtWarehouse',
      allowed: [ReturnStatus.PICKED_UP, ReturnStatus.IN_TRANSIT_TO_WAREHOUSE].includes(status),
      requiredPermission: RETURN_PERMISSIONS.STATUS,
    },
    {
      action: 'submitQc',
      allowed: status === ReturnStatus.QC_PENDING,
      requiredPermission: RETURN_PERMISSIONS.STATUS,
    },
    {
      action: 'createRefund',
      allowed: status === ReturnStatus.REFUND_PENDING && !entity.refundRequestId,
      requiredPermission: RETURN_PERMISSIONS.APPROVE,
    },
    {
      action: 'linkReplacement',
      allowed: status === ReturnStatus.REPLACEMENT_PENDING && !entity.replacementOrderId,
      requiredPermission: RETURN_PERMISSIONS.STATUS,
    },
    {
      action: 'complete',
      allowed: [ReturnStatus.REFUND_COMPLETED, ReturnStatus.REPLACEMENT_CREATED].includes(status),
      requiredPermission: RETURN_PERMISSIONS.STATUS,
    },
  ];
};
