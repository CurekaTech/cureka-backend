import { PaymentRequestStatus } from '../enums/payment-request-status.enum';
import { canTransitionPaymentRequestStatus } from './payment-request-status-transition.util';

describe('canTransitionPaymentRequestStatus', () => {
  it('allows pending → link generated → paid', () => {
    expect(
      canTransitionPaymentRequestStatus(
        PaymentRequestStatus.PAYMENT_PENDING,
        PaymentRequestStatus.LINK_GENERATED,
      ),
    ).toBe(true);
    expect(
      canTransitionPaymentRequestStatus(
        PaymentRequestStatus.LINK_GENERATED,
        PaymentRequestStatus.PAID,
      ),
    ).toBe(true);
  });

  it('blocks any transition away from PAID (duplicate cancel/expire)', () => {
    expect(
      canTransitionPaymentRequestStatus(
        PaymentRequestStatus.PAID,
        PaymentRequestStatus.CANCELLED,
      ),
    ).toBe(false);
    expect(
      canTransitionPaymentRequestStatus(PaymentRequestStatus.PAID, PaymentRequestStatus.EXPIRED),
    ).toBe(false);
    expect(
      canTransitionPaymentRequestStatus(PaymentRequestStatus.PAID, PaymentRequestStatus.FAILED),
    ).toBe(false);
  });

  it('allows pending/link → failed, and failed → paid/link regenerate', () => {
    expect(
      canTransitionPaymentRequestStatus(
        PaymentRequestStatus.LINK_GENERATED,
        PaymentRequestStatus.FAILED,
      ),
    ).toBe(true);
    expect(
      canTransitionPaymentRequestStatus(
        PaymentRequestStatus.FAILED,
        PaymentRequestStatus.PAID,
      ),
    ).toBe(true);
    expect(
      canTransitionPaymentRequestStatus(
        PaymentRequestStatus.FAILED,
        PaymentRequestStatus.LINK_GENERATED,
      ),
    ).toBe(true);
  });
});
