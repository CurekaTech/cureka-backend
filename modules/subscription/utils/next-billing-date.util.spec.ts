import {
  addCalendarMonths,
  addMonths,
  advancePastMissedCycles,
  getEstimatedDeliveryDate,
  getNextMembershipBillingDate,
  getNextProductBillingDate,
  scheduleAnchorDay,
} from './next-billing-date.util';
import { MembershipBillingCycle } from '../enums/membership-billing-cycle.enum';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';

describe('next-billing-date.util', () => {
  const timeZone = 'Asia/Kolkata';
  const base = new Date(Date.UTC(2026, 0, 15, 6, 30, 0));

  it('addMonths advances calendar month without UTC overflow', () => {
    expect(addMonths(base, 1).toISOString()).toBe('2026-02-15T06:30:00.000Z');
  });

  it('getNextProductBillingDate treats BI_MONTHLY as every two months', () => {
    expect(getNextProductBillingDate(base, ProductSubscriptionFrequency.MONTHLY, 'UTC').getUTCMonth()).toBe(1);
    expect(getNextProductBillingDate(base, ProductSubscriptionFrequency.BI_MONTHLY, 'UTC').getUTCMonth()).toBe(2);
    expect(getNextProductBillingDate(base, ProductSubscriptionFrequency.QUARTERLY, 'UTC').getUTCMonth()).toBe(3);
  });

  it('clamps month-end January 31 to February 28', () => {
    const jan31 = new Date(Date.UTC(2026, 0, 31, 6, 30, 0));
    const next = addCalendarMonths(jan31, 1, 'UTC', 31);
    expect(next.getUTCMonth()).toBe(1);
    expect(next.getUTCDate()).toBe(28);
  });

  it('keeps the 15th in Asia/Kolkata across DST-less IST months', () => {
    const next = getNextProductBillingDate(base, ProductSubscriptionFrequency.MONTHLY, timeZone);
    expect(scheduleAnchorDay(next, timeZone)).toBe(15);
  });

  it('keeps charge date distinct from estimated delivery date', () => {
    const charge = getNextProductBillingDate(base, ProductSubscriptionFrequency.MONTHLY, 'UTC');
    const delivery = getEstimatedDeliveryDate(charge, 2);
    expect(delivery.getTime() - charge.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('does not catch-up charge every missed cycle after downtime', () => {
    const original = new Date(Date.UTC(2026, 0, 15));
    const asOf = new Date(Date.UTC(2026, 4, 20));
    const result = advancePastMissedCycles({
      nextBillingDate: original,
      frequency: ProductSubscriptionFrequency.MONTHLY,
      asOfDate: asOf,
      timeZone: 'UTC',
      anchorDay: 15,
    });
    expect(result.skippedCount).toBeGreaterThanOrEqual(3);
    expect(result.nextBillingDate.getUTCMonth()).toBeLessThanOrEqual(4);
  });

  it('getNextMembershipBillingDate respects billing cycle', () => {
    expect(getNextMembershipBillingDate(base, MembershipBillingCycle.MONTHLY).getUTCMonth()).toBe(1);
    expect(getNextMembershipBillingDate(base, MembershipBillingCycle.QUARTERLY).getUTCMonth()).toBe(3);
    expect(getNextMembershipBillingDate(base, MembershipBillingCycle.YEARLY).getUTCFullYear()).toBe(2027);
  });
});
