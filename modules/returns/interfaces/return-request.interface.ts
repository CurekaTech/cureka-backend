import { IOrderItemReturnPolicySnapshot } from '@modules/orders/interfaces/order-item-return-policy.interface';
import { IStorageFileReferenceResponse } from '@packages/storage';
import { ReturnEvidenceMediaType, ReturnEvidenceSource } from '../enums/return-evidence.enum';
import { ReturnHistoryAction } from '../enums/return-history-action.enum';
import { ReturnPickupProvider } from '../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import { ReturnQcResult } from '../enums/return-qc-result.enum';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { IReturnAmountBreakdown } from './return-amount-breakdown.interface';
import { IReturnPickupAddress } from './return-pickup-address.interface';

export type ReturnSlaStatus = 'GREEN' | 'ORANGE' | 'RED';

export type ReturnActor = {
  id: string;
  email?: string;
  role?: string | null;
  type: ReturnRequestedByType;
};

export interface IReturnRequestItemView {
  id: string;
  orderItemId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string;
  refundableAmount: string;
  deliveredAt: Date | null;
  acceptedQuantity: number | null;
  rejectedQuantity: number | null;
  qcRejectionReason: string | null;
  replacementVariantId: string | null;
  replacementSku: string | null;
  policySnapshot: IOrderItemReturnPolicySnapshot | null;
}

export interface IReturnEvidenceView {
  id: string;
  returnRequestItemId: string | null;
  mediaType: ReturnEvidenceMediaType;
  source: ReturnEvidenceSource;
  file: IStorageFileReferenceResponse | null;
  originalFilename: string | null;
  createdAt: Date;
}

export interface IReturnTimelineEntry {
  id: string;
  fromStatus: ReturnStatus | null;
  toStatus: ReturnStatus;
  action: ReturnHistoryAction;
  comment: string | null;
  createdAt: Date;
}

export interface IReturnAdminTimelineEntry extends IReturnTimelineEntry {
  isCustomerVisible: boolean;
  performedBy: string;
  performedByRole: string | null;
  metadata: Record<string, unknown> | null;
}

export interface IReturnPickupView {
  id: string;
  provider: ReturnPickupProvider;
  status: ReturnPickupStatus;
  providerPickupId: string | null;
  reverseAwbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  scheduledAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAtWarehouseAt: Date | null;
  attemptCount: number;
  lastEventAt: Date | null;
  lastEventStatus: string | null;
  failureReason: string | null;
  unicommerceReversePickupCode: string | null;
  shipwayOrderId: string | null;
}

export interface IReturnQcView {
  id: string;
  returnRequestItemId: string;
  result: ReturnQcResult;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  rejectionReason: string | null;
  notes: string | null;
  performedBy: string;
  performedAt: Date;
}

export interface IReturnRefundLinkView {
  refundRequestId: string | null;
  refundRefId: string | null;
  refundStatus: string | null;
  refundAmount: string | null;
  paymentProvider: string | null;
  linkedAt: Date | null;
}

export interface IReturnRequestListItem {
  id: string;
  refId: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  customer: {
    id: string | null;
    name: string | null;
    mobileNumber: string | null;
    email: string | null;
  };
  status: ReturnStatus;
  resolution: ReturnResolution;
  reasonCode: string;
  reasonTitle: string;
  itemCount: number;
  totalQuantity: number;
  estimatedRefundAmount: string;
  approvedRefundAmount: string | null;
  currency: string;
  pickupRequired: boolean;
  qcRequired: boolean;
  isAdminInitiated: boolean;
  assignedToUserId: string | null;
  deliveredAt: Date | null;
  returnWindowExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ageInHours: number;
  slaStatus: ReturnSlaStatus;
  skus: string[];
}

export interface IReturnAvailableAction {
  action: string;
  allowed: boolean;
  requiredPermission: string;
}

export interface IReturnRequestDetail extends IReturnRequestListItem {
  customerComments: string | null;
  conditionDeclarations: Record<string, boolean> | null;
  isExpiredProductClaim: boolean;
  eligibilityOverridden: boolean;
  overrideReason: string | null;
  internalJustification: string | null;
  customerVisibleExplanation: string | null;
  eligibilitySnapshot: Record<string, unknown> | null;
  pickupAddress: IReturnPickupAddress | null;
  rejectionReason: string | null;
  informationRequestMessage: string | null;
  informationRequestedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  pickedUpAt: Date | null;
  receivedAtWarehouseAt: Date | null;
  qcCompletedAt: Date | null;
  noPickupApproved: boolean;
  completedAt: Date | null;
  cancelledAt: Date | null;
  amountBreakdown: IReturnAmountBreakdown | null;
  items: IReturnRequestItemView[];
  evidence: IReturnEvidenceView[];
  pickups: IReturnPickupView[];
  qcRecords: IReturnQcView[];
  refund: IReturnRefundLinkView;
  replacement: {
    replacementOrderId: string | null;
    linkedAt: Date | null;
  };
  codRefund: {
    method: string | null;
    bankDetails: {
      accountHolderName: string | null;
      accountNumberMasked: string | null;
      ifsc: string | null;
      bankName: string | null;
      locked: boolean;
    } | null;
  } | null;
  timeline: IReturnAdminTimelineEntry[];
  availableActions: IReturnAvailableAction[];
}

/**
 * Customer-safe list row. Deliberately narrower than `IReturnRequestListItem`,
 * which carries operational fields (assignee, SLA, admin-initiated flag) that
 * must not leave the admin surface.
 */
export interface ICustomerReturnListItem {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  displayStatus: string;
  resolution: ReturnResolution;
  reasonTitle: string;
  itemCount: number;
  totalQuantity: number;
  estimatedRefundAmount: string;
  approvedRefundAmount: string | null;
  currency: string;
  canCancel: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Customer-safe projection — excludes internal notes, actors and justifications. */
export interface ICustomerReturnDetail {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  displayStatus: string;
  resolution: ReturnResolution;
  reasonTitle: string;
  customerComments: string | null;
  estimatedRefundAmount: string;
  approvedRefundAmount: string | null;
  currency: string;
  pickupRequired: boolean;
  pickupAddress: IReturnPickupAddress | null;
  deliveredAt: Date | null;
  returnWindowExpiresAt: Date | null;
  createdAt: Date;
  /** Reason shown when the request was rejected or failed QC. */
  outcomeMessage: string | null;
  informationRequestMessage: string | null;
  canCancel: boolean;
  canSubmitAdditionalInformation: boolean;
  items: Array<
    Pick<
      IReturnRequestItemView,
      | 'id'
      | 'orderItemId'
      | 'sku'
      | 'productName'
      | 'variantName'
      | 'quantity'
      | 'unitPrice'
      | 'refundableAmount'
      | 'acceptedQuantity'
      | 'rejectedQuantity'
    > & {
      /** Signed product thumbnail URL when available. */
      imageUrl: string | null;
    }
  >;
  evidence: IReturnEvidenceView[];
  tracking: {
    reverseAwbNumber: string | null;
    courierName: string | null;
    trackingUrl: string | null;
    status: ReturnPickupStatus | null;
    scheduledAt: Date | null;
    pickedUpAt: Date | null;
  } | null;
  refund: {
    status: string | null;
    amount: string | null;
    message: string | null;
  };
  codRefund: {
    method: string | null;
    payoutStatus: string | null;
    bankDetails: {
      accountHolderName: string | null;
      accountNumberMasked: string | null;
      ifsc: string | null;
      bankName: string | null;
      locked: boolean;
    } | null;
    customerMessage: string | null;
    canUpdateBankDetails: boolean;
  } | null;
  timeline: IReturnTimelineEntry[];
}
