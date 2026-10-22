import { parseMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { CodRefundMethod } from '../enums/cod-refund-method.enum';
import { IRefundAmountAllocation } from '../interfaces/refund-amount-allocation.interface';

/**
 * Builds the post-approve settlement allocation.
 * Admin chooses WALLET (default) or BANK_ACCOUNT for the full approved amount.
 * Wallet settlement does not call the payment gateway — merchant retains captured
 * funds and the customer receives in-store wallet credit.
 */
export function buildAdminSettlementAllocation(params: {
  approvedAmount: string;
  destination: CodRefundMethod;
  currency?: string;
}): IRefundAmountAllocation {
  const total = toMoneyString(parseMoney(params.approvedAmount));
  const currency = params.currency ?? 'INR';
  const destination =
    params.destination === CodRefundMethod.BANK_ACCOUNT
      ? CodRefundMethod.BANK_ACCOUNT
      : CodRefundMethod.WALLET;

  return {
    currency,
    totalAmount: total,
    onlineAmount: '0.00',
    originalWalletAmount: '0.00',
    codAmount: total,
    onlineProvider: null,
    codRefundMethod: destination,
    onlineStatus: 'COMPLETED',
    originalWalletStatus: 'COMPLETED',
    codStatus: 'PENDING',
    adminSettlementDestination: destination,
  };
}

export function resolveApproveRefundDestination(
  requested?: CodRefundMethod | null,
): CodRefundMethod {
  return requested === CodRefundMethod.BANK_ACCOUNT
    ? CodRefundMethod.BANK_ACCOUNT
    : CodRefundMethod.WALLET;
}
