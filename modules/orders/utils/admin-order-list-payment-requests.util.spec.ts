import { PaymentRequestStatus } from '@modules/payment-requests/enums/payment-request-status.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderSource } from '../enums/order-source.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { resolveAdminListPaymentRequestStatuses } from './admin-order-list-payment-requests.util';

describe('resolveAdminListPaymentRequestStatuses', () => {
  it('includes unpaid admin payment requests on the unfiltered orders list', () => {
    expect(resolveAdminListPaymentRequestStatuses({})).toEqual([
      PaymentRequestStatus.PAYMENT_PENDING,
      PaymentRequestStatus.LINK_GENERATED,
      PaymentRequestStatus.FAILED,
      PaymentRequestStatus.CANCELLED,
      PaymentRequestStatus.EXPIRED,
    ]);
  });

  it('includes unpaid admin payment requests when filtering orderSource=Admin', () => {
    expect(
      resolveAdminListPaymentRequestStatuses({ orderSource: OrderSource.ADMIN }),
    ).toContain(PaymentRequestStatus.PAYMENT_PENDING);
  });

  it('excludes payment requests when filtering a non-admin order source', () => {
    expect(
      resolveAdminListPaymentRequestStatuses({ orderSource: OrderSource.WEBSITE }),
    ).toEqual([]);
  });

  it('excludes payment requests when filtering a fulfillment status they cannot have', () => {
    expect(
      resolveAdminListPaymentRequestStatuses({ orderStatus: OrderStatus.CONFIRMED }),
    ).toEqual([]);
  });
});
