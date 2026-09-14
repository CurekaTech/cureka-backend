import { CodPayoutStatus } from '../enums/cod-payout-status.enum';
import { CodRefundMethod } from '../enums/cod-refund-method.enum';
import { IRefundAmountAllocation } from './refund-amount-allocation.interface';

export interface IMaskedBankDetails {
  accountHolderName: string | null;
  accountNumberMasked: string | null;
  ifsc: string | null;
  bankName: string | null;
  accountType: string | null;
  submittedAt: Date | null;
  locked: boolean;
}

export interface ICustomerCodRefundView {
  required: boolean;
  method: CodRefundMethod | null;
  allowedMethods: CodRefundMethod[];
  walletEnabled: boolean;
  bankDetails: IMaskedBankDetails | null;
  payoutStatus: CodPayoutStatus | null;
  customerMessage: string | null;
}

export interface ICodPayoutAdminView {
  id: string;
  refId: string;
  refundRequestId: string;
  returnRequestId: string | null;
  orderId: string;
  customerId: string;
  amount: string;
  currency: string;
  refundMethod: CodRefundMethod;
  status: CodPayoutStatus;
  bankDetails: IMaskedBankDetails | null;
  processedBy: string | null;
  processedAt: Date | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  utr: string | null;
  transferDate: string | null;
  paymentProofPath: string | null;
  failureReason: string | null;
  internalNotes: string | null;
  customerVisibleNotes: string | null;
  providerCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICodPayoutProviderResult {
  accepted: boolean;
  providerReference: string | null;
  message: string | null;
}

export interface ICodPayoutProvider {
  readonly code: string;
  isConfigured(): boolean;
  /**
   * Future bank-payout APIs implement this. The MANUAL provider never sends
   * money; Finance records the UTR after an offline transfer.
   */
  submit(payout: {
    id: string;
    amount: string;
    currency: string;
  }): Promise<ICodPayoutProviderResult>;
}

export type CodRefundDestination = {
  required: boolean;
  allowedMethods: CodRefundMethod[];
  defaultMethod: CodRefundMethod;
  walletEnabled: boolean;
  message: string | null;
};

export type { IRefundAmountAllocation };
