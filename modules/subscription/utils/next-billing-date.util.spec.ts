import {
  addMonths,
  getNextMembershipBillingDate,
  getNextProductBillingDate,
} from './next-billing-date.util';
import { MembershipBillingCycle } from '../enums/membership-billing-cycle.enum';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';

describe('next-billing-date.util', () => {
  const base = new Date(Date.UTC(2026, 0, 15));

  it('addMonths advances UTC month', () => {
    expect(addMonths(base, 1).toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });

  it('getNextProductBillingDate respects frequency', () => {
    expect(getNextProductBillingDate(base, ProductSubscriptionFrequency.MONTHLY).getUTCMonth()).toBe(1);
    expect(getNextProductBillingDate(base, ProductSubscriptionFrequency.BI_MONTHLY).getUTCMonth()).toBe(2);
    expect(getNextProductBillingDate(base, ProductSubscriptionFrequency.QUARTERLY).getUTCMonth()).toBe(3);
  });

  it('getNextMembershipBillingDate respects billing cycle', () => {
    expect(getNextMembershipBillingDate(base, MembershipBillingCycle.MONTHLY).getUTCMonth()).toBe(1);
    expect(getNextMembershipBillingDate(base, MembershipBillingCycle.QUARTERLY).getUTCMonth()).toBe(3);
    expect(getNextMembershipBillingDate(base, MembershipBillingCycle.YEARLY).getUTCFullYear()).toBe(2027);
  });
});
