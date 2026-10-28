import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { resolveSubscriptionPaymentPhase } from './subscription-payment-phase.util';

describe('subscription payment phase', () => {
  const pending = ProductSubscriptionStatus.PENDING_PAYMENT;

  it('does not confirm an order when the mandate exists and the product payment is still open', () => {
    expect(
      resolveSubscriptionPaymentPhase({
        status: pending,
        autopayReady: true,
        payments: [{ status: SubscriptionPaymentStatus.LINK_GENERATED }],
      }),
    ).toEqual({ phase: 'PRODUCT_PROCESSING', orderId: null, retryAllowed: false });
  });

  it('confirms the order only from a paid product payment', () => {
    expect(
      resolveSubscriptionPaymentPhase({
        status: ProductSubscriptionStatus.ACTIVE,
        autopayReady: true,
        payments: [{ status: SubscriptionPaymentStatus.PAID, orderId: 'order-row-1' }],
      }),
    ).toEqual({ phase: 'PRODUCT_CONFIRMED', orderId: 'order-row-1', retryAllowed: false });
  });

  it('keeps a reconciling or unknown charge pending and blocks another payment', () => {
    expect(
      resolveSubscriptionPaymentPhase({
        status: pending,
        autopayReady: true,
        payments: [{ status: SubscriptionPaymentStatus.RECONCILING, gatewayPaymentId: 'pay_product' }],
      }).retryAllowed,
    ).toBe(false);
  });

  it('does not keep a cancelled subscription in payment processing', () => {
    expect(
      resolveSubscriptionPaymentPhase({
        status: ProductSubscriptionStatus.CANCELLED,
        autopayReady: true,
        payments: [{ status: SubscriptionPaymentStatus.RECONCILING, gatewayPaymentId: 'pay_product' }],
      }),
    ).toEqual({ phase: 'AWAITING_AUTHORIZATION', orderId: null, retryAllowed: false });
  });

  it('allows retry only after the product payment has failed', () => {
    expect(
      resolveSubscriptionPaymentPhase({
        status: pending,
        autopayReady: true,
        payments: [{ status: SubscriptionPaymentStatus.FAILED }],
      }),
    ).toMatchObject({ phase: 'PRODUCT_FAILED', retryAllowed: true });
  });

  it('does not treat a registration-only subscription as a confirmed order', () => {
    const phase = resolveSubscriptionPaymentPhase({
      status: pending,
      autopayReady: true,
      firstOrderId: null,
      payments: [{ status: SubscriptionPaymentStatus.LINK_GENERATED, gatewayPaymentId: null }],
    });
    expect(phase.phase).not.toBe('PRODUCT_CONFIRMED');
    expect(phase.retryAllowed).toBe(false);
  });
});
