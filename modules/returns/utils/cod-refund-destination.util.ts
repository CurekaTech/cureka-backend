import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { CodRefundMethod } from '@modules/refund-requests/enums/cod-refund-method.enum';
import { CodRefundDestination } from '@modules/refund-requests/interfaces/cod-refund-payout.interface';

export function orderHasCodRefundPortion(paymentMethod: OrderPaymentMethod): boolean {
  return (
    paymentMethod === OrderPaymentMethod.COD ||
    paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD
  );
}

export function describeCodRefundDestination(
  paymentMethod: OrderPaymentMethod,
  walletEnabled: boolean,
): CodRefundDestination {
  const required = orderHasCodRefundPortion(paymentMethod);
  if (!required) {
    return {
      required: false,
      allowedMethods: [],
      defaultMethod: CodRefundMethod.BANK_ACCOUNT,
      walletEnabled,
      message: null,
    };
  }

  const allowedMethods = walletEnabled
    ? [CodRefundMethod.BANK_ACCOUNT, CodRefundMethod.WALLET]
    : [CodRefundMethod.BANK_ACCOUNT];

  return {
    required: true,
    allowedMethods,
    defaultMethod: CodRefundMethod.BANK_ACCOUNT,
    walletEnabled,
    message: walletEnabled
      ? 'This order includes a cash-on-delivery amount. Choose bank transfer or Cureka Wallet for that portion.'
      : 'This order includes a cash-on-delivery amount. Enter the bank account that should receive the refund.',
  };
}
