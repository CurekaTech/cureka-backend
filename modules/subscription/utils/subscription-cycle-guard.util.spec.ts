import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import {
  isChangeCutoffReached,
  isCycleInFlight,
  isCyclePaid,
} from './subscription-cycle-guard.util';

describe('subscription-cycle-guard.util', () => {
  it('treats debit/link/paid cycles as in-flight', () => {
    expect(isCycleInFlight(SubscriptionBillingCycleStatus.DEBIT_PENDING)).toBe(true);
    expect(isCycleInFlight(SubscriptionBillingCycleStatus.SCHEDULED)).toBe(false);
  });

  it('treats paid and paid-order-pending as paid', () => {
    expect(isCyclePaid(SubscriptionBillingCycleStatus.PAID)).toBe(true);
    expect(isCyclePaid(SubscriptionBillingCycleStatus.PAID_ORDER_PENDING)).toBe(true);
    expect(isCyclePaid(SubscriptionBillingCycleStatus.FAILED)).toBe(false);
  });

  it('blocks changes inside the cutoff window', () => {
    const chargeDate = new Date('2026-09-10T06:30:00.000Z');
    const asOfDate = new Date('2026-09-10T00:30:00.000Z');
    expect(isChangeCutoffReached({ chargeDate, asOfDate, cutoffHours: 12 })).toBe(true);
    expect(
      isChangeCutoffReached({
        chargeDate,
        asOfDate: new Date('2026-09-08T00:00:00.000Z'),
        cutoffHours: 12,
      }),
    ).toBe(false);
  });
});
