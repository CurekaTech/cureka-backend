import { PaymentRequestStatus } from '@modules/payment-requests/enums/payment-request-status.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderSource } from '../enums/order-source.enum';
import { OrderStatus } from '../enums/order-status.enum';

const UNPAID_ADMIN_PR_STATUSES = [
  PaymentRequestStatus.PAYMENT_PENDING,
  PaymentRequestStatus.LINK_GENERATED,
  PaymentRequestStatus.FAILED,
  PaymentRequestStatus.CANCELLED,
  PaymentRequestStatus.EXPIRED,
] as const;

/**
 * Admin-created payment requests that are not yet real `orders` rows.
 * Returns `[]` when list filters cannot match those drafts.
 */
export function resolveAdminListPaymentRequestStatuses(options: {
  orderSource?: OrderSource;
  orderStatus?: OrderStatus;
  paymentStatus?: OrderPaymentStatus;
}): PaymentRequestStatus[] {
  if (options.orderSource && options.orderSource !== OrderSource.ADMIN) {
    return [];
  }

  if (
    options.orderStatus &&
    options.orderStatus !== OrderStatus.PENDING &&
    options.orderStatus !== OrderStatus.CANCELLED
  ) {
    return [];
  }

  if (
    options.paymentStatus &&
    options.paymentStatus !== OrderPaymentStatus.PENDING &&
    options.paymentStatus !== OrderPaymentStatus.FAILED
  ) {
    return [];
  }

  if (options.orderStatus === OrderStatus.CANCELLED) {
    return [PaymentRequestStatus.CANCELLED, PaymentRequestStatus.EXPIRED];
  }

  if (options.orderStatus === OrderStatus.PENDING && options.paymentStatus === OrderPaymentStatus.FAILED) {
    return [PaymentRequestStatus.FAILED];
  }

  if (options.orderStatus === OrderStatus.PENDING) {
    return [PaymentRequestStatus.PAYMENT_PENDING, PaymentRequestStatus.LINK_GENERATED];
  }

  if (options.paymentStatus === OrderPaymentStatus.FAILED) {
    return [PaymentRequestStatus.FAILED];
  }

  if (options.paymentStatus === OrderPaymentStatus.PENDING) {
    return [
      PaymentRequestStatus.PAYMENT_PENDING,
      PaymentRequestStatus.LINK_GENERATED,
      PaymentRequestStatus.CANCELLED,
      PaymentRequestStatus.EXPIRED,
    ];
  }

  return [...UNPAID_ADMIN_PR_STATUSES];
}
