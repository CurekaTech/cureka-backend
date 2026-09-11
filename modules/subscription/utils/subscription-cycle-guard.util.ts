import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';

export const CYCLE_IN_FLIGHT_STATUSES: SubscriptionBillingCycleStatus[] = [
  SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
  SubscriptionBillingCycleStatus.DEBIT_PENDING,
  SubscriptionBillingCycleStatus.LINK_GENERATED,
  SubscriptionBillingCycleStatus.PAID,
  SubscriptionBillingCycleStatus.PAID_ORDER_PENDING,
];

export const CYCLE_PAID_STATUSES: SubscriptionBillingCycleStatus[] = [
  SubscriptionBillingCycleStatus.PAID,
  SubscriptionBillingCycleStatus.PAID_ORDER_PENDING,
];

export function isCycleInFlight(status: SubscriptionBillingCycleStatus): boolean {
  return CYCLE_IN_FLIGHT_STATUSES.includes(status);
}

export function isCyclePaid(status: SubscriptionBillingCycleStatus): boolean {
  return CYCLE_PAID_STATUSES.includes(status);
}

export function isChangeCutoffReached(params: {
  chargeDate: Date;
  asOfDate: Date;
  cutoffHours: number;
}): boolean {
  const cutoffMs = Math.max(0, params.cutoffHours) * 60 * 60 * 1000;
  return params.chargeDate.getTime() - params.asOfDate.getTime() <= cutoffMs;
}
