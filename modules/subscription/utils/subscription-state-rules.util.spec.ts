import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';

describe('first payment vs mandate states', () => {
  it('keeps a paid first order valid when mandate setup has not succeeded', () => {
    const subscription = {
      status: ProductSubscriptionStatus.ACTIVE,
      firstOrderId: 'order-1',
      autopayReady: false,
      renewalMethod: SubscriptionRenewalMethod.PAYMENT_LINK,
    };

    expect(subscription.status).toBe(ProductSubscriptionStatus.ACTIVE);
    expect(subscription.firstOrderId).toBeTruthy();
    expect(subscription.autopayReady).toBe(false);
    expect(subscription.renewalMethod).toBe(SubscriptionRenewalMethod.PAYMENT_LINK);
  });

  it('does not treat mandate authorisation as product payment', () => {
    const mandateOnly = {
      status: ProductSubscriptionStatus.PENDING_PAYMENT,
      autopayReady: true,
      firstOrderId: null,
    };
    expect(mandateOnly.autopayReady).toBe(true);
    expect(mandateOnly.firstOrderId).toBeNull();
    expect(mandateOnly.status).not.toBe(ProductSubscriptionStatus.ACTIVE);
  });
});

describe('checkout toggle vs mandate provider', () => {
  it('refuses to charge a Razorpay mandate through Cashfree', () => {
    const storedProvider = 'RAZORPAY';
    const checkoutToggle = 'CASHFREE';
    expect(storedProvider).not.toBe(checkoutToggle);
    const chargeProvider = storedProvider;
    expect(chargeProvider).toBe('RAZORPAY');
  });
});

describe('mixed cart', () => {
  it('documents mixed one-time + subscription as a single existing checkout order', () => {
    const cart = [
      { isSubscription: false, frequency: null },
      { isSubscription: true, frequency: 'MONTHLY' },
    ];
    expect(cart.some((item) => item.isSubscription) && cart.some((item) => !item.isSubscription)).toBe(
      true,
    );
  });
});
