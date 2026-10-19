import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { CodRefundMethod } from '../enums/cod-refund-method.enum';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { IRefundAmountAllocation } from '../interfaces/refund-amount-allocation.interface';
import { paiseToRupees } from './wallet-money.util';

export type AllocateReturnRefundFundsInput = {
  paymentMethod: OrderPaymentMethod;
  refundAmount: string | number;
  orderGrandTotal: string | number;
  prepaidAmount?: string | number;
  payableOnDelivery?: string | number;
  onlineProvider?: RefundPaymentProvider | null;
  codRefundMethod?: CodRefundMethod | null;
  /** Posted wallet tender for the order, in paise. */
  walletAmountPaise?: string | number | null;
  /** Posted gateway tender for the order, in paise. */
  gatewayAmountPaise?: string | number | null;
};

/**
 * Splits a return refund across original sources of funds.
 *
 * Prepaid / gateway money always returns to the original provider.
 * Cash-on-delivery money uses the customer-selected COD destination.
 * Wallet tender (full or hybrid) restores to the original wallet using
 * persisted order wallet/gateway paise allocations.
 */
export function allocateReturnRefundFunds(
  input: AllocateReturnRefundFundsInput,
): IRefundAmountAllocation {
  const total = roundMoney(parseMoney(String(input.refundAmount)));
  const grandTotal = roundMoney(parseMoney(String(input.orderGrandTotal)));
  const prepaid = roundMoney(parseMoney(String(input.prepaidAmount ?? 0)));
  const payableOnDelivery = roundMoney(
    parseMoney(String(input.payableOnDelivery ?? 0)),
  );
  const walletPaidPaise = toNonNegativeInt(input.walletAmountPaise);
  const gatewayPaidPaise = toNonNegativeInt(input.gatewayAmountPaise);

  let onlineAmount = 0;
  let originalWalletAmount = 0;
  let codAmount = 0;
  let onlineProvider: RefundPaymentProvider | null = input.onlineProvider ?? null;

  if (total <= 0) {
    return emptyAllocation(input.codRefundMethod ?? null, onlineProvider);
  }

  if (walletPaidPaise > 0 || input.paymentMethod === OrderPaymentMethod.WALLET) {
    const split = splitWalletAndGatewayRefund({
      refundAmount: total,
      walletPaidPaise,
      gatewayPaidPaise,
      paymentMethod: input.paymentMethod,
      grandTotal,
    });
    originalWalletAmount = split.walletAmount;
    onlineAmount = split.onlineAmount;
    if (onlineAmount > 0) {
      onlineProvider = onlineProvider ?? mapOnlineProvider(input.paymentMethod);
    } else {
      onlineProvider = null;
    }
    return {
      currency: 'INR',
      totalAmount: toMoneyString(total),
      onlineAmount: toMoneyString(onlineAmount),
      originalWalletAmount: toMoneyString(originalWalletAmount),
      codAmount: '0.00',
      onlineProvider,
      codRefundMethod: null,
      onlineStatus: onlineAmount > 0 ? 'PENDING' : 'COMPLETED',
      originalWalletStatus: originalWalletAmount > 0 ? 'PENDING' : 'COMPLETED',
      codStatus: 'COMPLETED',
    };
  }

  switch (input.paymentMethod) {
    case OrderPaymentMethod.COD:
      codAmount = total;
      onlineProvider = null;
      break;
    case OrderPaymentMethod.GOKWIK_PARTIAL_COD: {
      const codCollected =
        payableOnDelivery > 0
          ? payableOnDelivery
          : Math.max(0, roundMoney(grandTotal - prepaid));
      const sourceTotal = roundMoney(prepaid + codCollected);
      if (sourceTotal <= 0) {
        codAmount = total;
      } else {
        onlineAmount = roundMoney((total * prepaid) / sourceTotal);
        if (onlineAmount > total) onlineAmount = total;
        codAmount = roundMoney(total - onlineAmount);
      }
      onlineProvider = RefundPaymentProvider.GOKWIK;
      break;
    }
    default:
      onlineAmount = total;
      if (!onlineProvider) {
        onlineProvider = mapOnlineProvider(input.paymentMethod);
      }
      break;
  }

  return {
    currency: 'INR',
    totalAmount: toMoneyString(total),
    onlineAmount: toMoneyString(onlineAmount),
    originalWalletAmount: toMoneyString(originalWalletAmount),
    codAmount: toMoneyString(codAmount),
    onlineProvider,
    codRefundMethod: codAmount > 0 ? (input.codRefundMethod ?? CodRefundMethod.BANK_ACCOUNT) : null,
    onlineStatus: onlineAmount > 0 ? 'PENDING' : 'COMPLETED',
    originalWalletStatus: originalWalletAmount > 0 ? 'PENDING' : 'COMPLETED',
    codStatus: codAmount > 0 ? 'PENDING' : 'COMPLETED',
  };
}

export function allocationIsFullySettled(allocation: IRefundAmountAllocation): boolean {
  return (
    allocation.onlineStatus === 'COMPLETED' &&
    allocation.originalWalletStatus === 'COMPLETED' &&
    allocation.codStatus === 'COMPLETED'
  );
}

function splitWalletAndGatewayRefund(params: {
  refundAmount: number;
  walletPaidPaise: number;
  gatewayPaidPaise: number;
  paymentMethod: OrderPaymentMethod;
  grandTotal: number;
}): { walletAmount: number; onlineAmount: number } {
  let walletPaid = params.walletPaidPaise;
  let gatewayPaid = params.gatewayPaidPaise;

  if (params.paymentMethod === OrderPaymentMethod.WALLET && walletPaid <= 0) {
    walletPaid = Math.round(params.grandTotal * 100);
    gatewayPaid = 0;
  }

  const sourcePaise = walletPaid + gatewayPaid;
  if (sourcePaise <= 0) {
    if (params.paymentMethod === OrderPaymentMethod.WALLET) {
      return { walletAmount: params.refundAmount, onlineAmount: 0 };
    }
    return { walletAmount: 0, onlineAmount: params.refundAmount };
  }

  const refundPaise = Math.round(params.refundAmount * 100);
  const walletRefundPaise = Math.min(
    walletPaid,
    Math.round((refundPaise * walletPaid) / sourcePaise),
  );
  let onlineRefundPaise = Math.min(gatewayPaid, refundPaise - walletRefundPaise);
  // Absorb rounding residue into wallet when gateway is fully allocated.
  const allocated = walletRefundPaise + onlineRefundPaise;
  const walletAdjusted =
    allocated < refundPaise && walletRefundPaise < walletPaid
      ? Math.min(walletPaid, walletRefundPaise + (refundPaise - allocated))
      : walletRefundPaise;
  onlineRefundPaise = Math.min(gatewayPaid, refundPaise - walletAdjusted);

  return {
    walletAmount: roundMoney(parseMoney(paiseToRupees(walletAdjusted))),
    onlineAmount: roundMoney(parseMoney(paiseToRupees(onlineRefundPaise))),
  };
}

function mapOnlineProvider(paymentMethod: OrderPaymentMethod): RefundPaymentProvider {
  if (paymentMethod === OrderPaymentMethod.CASHFREE) return RefundPaymentProvider.CASHFREE;
  if (paymentMethod === OrderPaymentMethod.RAZORPAY) return RefundPaymentProvider.RAZORPAY;
  if (paymentMethod === OrderPaymentMethod.GOKWIK_PREPAID) return RefundPaymentProvider.GOKWIK;
  if (paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD) return RefundPaymentProvider.GOKWIK;
  if (paymentMethod === OrderPaymentMethod.WALLET) return RefundPaymentProvider.WALLET;
  return RefundPaymentProvider.OTHER;
}

function toNonNegativeInt(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

function emptyAllocation(
  codRefundMethod: CodRefundMethod | null,
  onlineProvider: RefundPaymentProvider | null,
): IRefundAmountAllocation {
  return {
    currency: 'INR',
    totalAmount: '0.00',
    onlineAmount: '0.00',
    originalWalletAmount: '0.00',
    codAmount: '0.00',
    onlineProvider,
    codRefundMethod,
    onlineStatus: 'COMPLETED',
    originalWalletStatus: 'COMPLETED',
    codStatus: 'COMPLETED',
  };
}
