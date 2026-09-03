import { PaymentRequestStatus } from '@modules/payment-requests/enums/payment-request-status.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { mapPaymentRequestToOrderStatuses } from './order.mapper';

describe('mapPaymentRequestToOrderStatuses', () => {
  it('maps unpaid admin payment requests to a pending order', () => {
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.PAYMENT_PENDING)).toEqual({
      orderStatus: OrderStatus.PENDING,
      paymentStatus: OrderPaymentStatus.PENDING,
    });
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.LINK_GENERATED)).toEqual({
      orderStatus: OrderStatus.PENDING,
      paymentStatus: OrderPaymentStatus.PENDING,
    });
  });

  it('maps paid and failed payment requests to matching order payment status', () => {
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.PAID)).toEqual({
      orderStatus: OrderStatus.CONFIRMED,
      paymentStatus: OrderPaymentStatus.PAID,
    });
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.FAILED)).toEqual({
      orderStatus: OrderStatus.PENDING,
      paymentStatus: OrderPaymentStatus.FAILED,
    });
  });

  it('maps cancelled and expired payment requests to a cancelled order', () => {
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.CANCELLED)).toEqual({
      orderStatus: OrderStatus.CANCELLED,
      paymentStatus: OrderPaymentStatus.PENDING,
    });
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.EXPIRED)).toEqual({
      orderStatus: OrderStatus.CANCELLED,
      paymentStatus: OrderPaymentStatus.PENDING,
    });
  });
});
