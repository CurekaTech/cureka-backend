import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import {
  buildRenewalPricingSnapshot,
  isBillingCyclePricingLocked,
} from './subscription-pricing-snapshot.util';

describe('subscription-pricing-snapshot.util', () => {
  const quote = {
    subscriptionPrice: '2000.00',
    discountAmount: '0.00',
    finalAmount: '2200.00',
    unitSellingPrice: '2200.00',
    quantity: 1,
    taxAmount: '0.00',
    shippingAmount: '0.00',
    sku: 'SKU-1',
    variantId: 'var-1',
    productId: 'prod-1',
    calculatedAt: '2026-11-13T00:00:00.000Z',
  };

  it('locks pricing after a CHARGE is scheduled or paid', () => {
    expect(isBillingCyclePricingLocked(SubscriptionBillingCycleStatus.SCHEDULED)).toBe(false);
    expect(isBillingCyclePricingLocked(SubscriptionBillingCycleStatus.FAILED)).toBe(false);
    expect(isBillingCyclePricingLocked(SubscriptionBillingCycleStatus.DEBIT_PENDING)).toBe(true);
    expect(isBillingCyclePricingLocked(SubscriptionBillingCycleStatus.NOTIFICATION_SENT)).toBe(true);
    expect(isBillingCyclePricingLocked(SubscriptionBillingCycleStatus.PAID)).toBe(true);
  });

  it('stores live merchandise fields, not the mandate maximum', () => {
    expect(buildRenewalPricingSnapshot(quote, { scheduledDebitDate: '2026-12-01' })).toEqual(
      expect.objectContaining({
        unitSellingPrice: '2200.00',
        finalAmount: '2200.00',
        discountAmount: '0.00',
        taxAmount: '0.00',
        shippingAmount: '0.00',
        scheduledDebitDate: '2026-12-01',
      }),
    );
  });
});
