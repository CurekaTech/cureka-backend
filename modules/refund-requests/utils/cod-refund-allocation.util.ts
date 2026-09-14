import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { CodRefundMethod } from '../enums/cod-refund-method.enum';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { IRefundAmountAllocation } from '../interfaces/refund-amount-allocation.interface';

export type AllocateReturnRefundFundsInput = {
  paymentMethod: OrderPaymentMethod;
  refundAmount: string | number;
  orderGrandTotal: string | number;
  prepaidAmount?: string | number;
  payableOnDelivery?: string | number;
  onlineProvider?: RefundPaymentProvider | null;
  codRefundMethod?: CodRefundMethod | null;
};

/**
 * Splits a return refund across original sources of funds.
 *
 * Prepaid / gateway money always returns to the original provider.
 * Cash-on-delivery money uses the customer-selected COD destination.
 * There is no wallet-paid column on orders, so original-wallet allocation is
 * only used when `paymentMethod` is WALLET.
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

  let onlineAmount = 0;
  let originalWalletAmount = 0;
  let codAmount = 0;
  let onlineProvider: RefundPaymentProvider | null = input.onlineProvider ?? null;

  if (total <= 0) {
    return emptyAllocation(input.codRefundMethod ?? null, onlineProvider);
  }

  switch (input.paymentMethod) {
    case OrderPaymentMethod.COD:
      codAmount = total;
      onlineProvider = null;
      break;
    case OrderPaymentMethod.WALLET:
      originalWalletAmount = total;
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
        onlineProvider =
          input.paymentMethod === OrderPaymentMethod.CASHFREE
            ? RefundPaymentProvider.CASHFREE
            : input.paymentMethod === OrderPaymentMethod.RAZORPAY
              ? RefundPaymentProvider.RAZORPAY
              : input.paymentMethod === OrderPaymentMethod.GOKWIK_PREPAID
                ? RefundPaymentProvider.GOKWIK
                : RefundPaymentProvider.OTHER;
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
