import { OrderPaymentMethod } from '../enums/order-payment-method.enum';

const PREPAID_PAYMENT_METHODS = new Set<OrderPaymentMethod>([
  OrderPaymentMethod.RAZORPAY,
  OrderPaymentMethod.CASHFREE,
  OrderPaymentMethod.WALLET,
  OrderPaymentMethod.GOKWIK_PREPAID,
]);

export function isPrepaidPaymentMethod(
  paymentMethod?: OrderPaymentMethod | null,
): boolean {
  if (!paymentMethod) {
    return false;
  }
  return PREPAID_PAYMENT_METHODS.has(paymentMethod);
}

const COD_PAYMENT_METHODS = new Set<OrderPaymentMethod>([
  OrderPaymentMethod.COD,
  OrderPaymentMethod.GOKWIK_PARTIAL_COD,
]);

export function isCodPaymentMethod(paymentMethod?: OrderPaymentMethod | null): boolean {
  if (!paymentMethod) {
    return false;
  }
  return COD_PAYMENT_METHODS.has(paymentMethod);
}
