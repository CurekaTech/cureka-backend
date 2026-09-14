import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { CodRefundMethod } from '../enums/cod-refund-method.enum';

export type RefundComponentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface IRefundAmountAllocation {
  currency: string;
  totalAmount: string;
  onlineAmount: string;
  originalWalletAmount: string;
  codAmount: string;
  onlineProvider: RefundPaymentProvider | null;
  codRefundMethod: CodRefundMethod | null;
  onlineStatus: RefundComponentStatus;
  originalWalletStatus: RefundComponentStatus;
  codStatus: RefundComponentStatus;
}
