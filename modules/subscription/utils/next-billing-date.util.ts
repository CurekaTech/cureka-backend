import { MembershipBillingCycle } from '../enums/membership-billing-cycle.enum';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';

const PRODUCT_FREQUENCY_MONTHS: Record<ProductSubscriptionFrequency, number> = {
  [ProductSubscriptionFrequency.MONTHLY]: 1,
  [ProductSubscriptionFrequency.BI_MONTHLY]: 2,
  [ProductSubscriptionFrequency.QUARTERLY]: 3,
};

const MEMBERSHIP_BILLING_CYCLE_MONTHS: Record<MembershipBillingCycle, number> = {
  [MembershipBillingCycle.MONTHLY]: 1,
  [MembershipBillingCycle.QUARTERLY]: 3,
  [MembershipBillingCycle.YEARLY]: 12,
};

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function getNextProductBillingDate(
  from: Date,
  frequency: ProductSubscriptionFrequency,
): Date {
  return addMonths(from, PRODUCT_FREQUENCY_MONTHS[frequency]);
}

export function getNextMembershipBillingDate(
  from: Date,
  billingCycle: MembershipBillingCycle,
): Date {
  return addMonths(from, MEMBERSHIP_BILLING_CYCLE_MONTHS[billingCycle]);
}
