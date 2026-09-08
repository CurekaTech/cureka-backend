import { RefundHistoryAction } from '../enums/refund-history-action.enum';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundReason } from '../enums/refund-reason.enum';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { RefundRequestedByType } from '../enums/refund-requested-by-type.enum';

export type RefundSlaStatus = 'GREEN' | 'ORANGE' | 'RED';

export type CustomerRefundDisplayStatus =
  | 'Refund request initiated'
  | 'Refund approved'
  | 'Refund processing'
  | 'Refund processed'
  | 'Refund failed. Please contact support.'
  | 'Refund request declined'
  | 'Refund request cancelled';

export interface IRefundableAmountBreakdown {
  capturedAmount: string;
  alreadyRefundedAmount: string;
  pendingRefundAmount: string;
  refundableAmount: string;
  currency: string;
  requiresOnlineRefund: boolean;
}

export interface IRefundProviderResolution {
  paymentProvider: RefundPaymentProvider;
  originalPaymentMethod: string;
  providerPaymentId: string | null;
  paymentRequestId: string | null;
  capturedAmount: string;
  identifiable: boolean;
  unresolvedReason?: string;
}

export interface IRefundRequestHistoryItem {
  id: string;
  fromStatus: RefundRequestStatus | null;
  toStatus: RefundRequestStatus;
  action: RefundHistoryAction;
  comment: string | null;
  performedBy: string;
  performedByRole: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface IRefundRequestListItem {
  id: string;
  refId: string;
  orderId: string;
  orderNumber: string;
  customer: {
    id: string | null;
    name: string | null;
    mobileNumber: string | null;
    email: string | null;
  };
  reason: RefundReason;
  requestedAmount: string;
  approvedAmount: string | null;
  currency: string;
  status: RefundRequestStatus;
  originalPaymentMethod: string;
  paymentProvider: RefundPaymentProvider;
  providerRefundId: string | null;
  requestedByType: RefundRequestedByType;
  assignedToUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  ageInHours: number;
  ageInDays: number;
  slaStatus: RefundSlaStatus;
  expectedCreditFrom: Date | null;
  expectedCreditTo: Date | null;
}

export interface IRefundAvailableAction {
  action: string;
  allowed: boolean;
  requiredPermission: string;
}

export interface IRefundRequestDetail extends IRefundRequestListItem {
  reasonDetails: string | null;
  rejectionReason: string | null;
  merchantRefundReference: string;
  providerPaymentId: string | null;
  providerRefundStatus: string | null;
  paymentRequestId: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  processingStartedBy: string | null;
  processingStartedAt: Date | null;
  processedAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  refundable: IRefundableAmountBreakdown;
  history: IRefundRequestHistoryItem[];
  availableActions: IRefundAvailableAction[];
}

export interface ICustomerRefundView {
  id: string;
  refId: string;
  status: RefundRequestStatus;
  displayStatus: CustomerRefundDisplayStatus;
  amount: string;
  currency: string;
  requestedAt: Date;
  processedAt: Date | null;
  expectedCreditMessage: string;
  message: string;
}

export type RefundActor = {
  id: string;
  email?: string;
  role?: string | null;
  type: RefundRequestedByType;
};
