import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipBillingCycle } from '../enums/membership-billing-cycle.enum';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';

/** Tenures that exist only so TechBV can exercise renewal without waiting a month. */
export const TEST_PRODUCT_FREQUENCIES = new Set<ProductSubscriptionFrequency>([
  ProductSubscriptionFrequency.MINUTES_2,
  ProductSubscriptionFrequency.MINUTES_5,
  ProductSubscriptionFrequency.MINUTES_30,
  ProductSubscriptionFrequency.HOURLY,
  ProductSubscriptionFrequency.HOURS_27,
  ProductSubscriptionFrequency.DAILY,
]);

export const TEST_MEMBERSHIP_CYCLES = new Set<MembershipBillingCycle>([
  MembershipBillingCycle.MINUTES_2,
  MembershipBillingCycle.MINUTES_5,
  MembershipBillingCycle.MINUTES_30,
  MembershipBillingCycle.HOURLY,
  MembershipBillingCycle.HOURS_27,
  MembershipBillingCycle.DAILY,
]);

export function isSubscriptionTestTenuresEnabled(
  config: Pick<ConfigService, 'get'>,
): boolean {
  return config.get<boolean>('subscriptions.testTenuresEnabled') === true;
}

export function assertProductFrequenciesAllowed(
  config: Pick<ConfigService, 'get'>,
  frequencies: Iterable<ProductSubscriptionFrequency>,
): void {
  if (isSubscriptionTestTenuresEnabled(config)) return;
  for (const frequency of frequencies) {
    if (TEST_PRODUCT_FREQUENCIES.has(frequency)) {
      throw new BadRequestException(
        '2-minute, 5-minute, 30-minute, 1-hour, 27-hour, and 1-day tenures are only available in the TechBV test environment',
      );
    }
  }
}

export function assertMembershipCycleAllowed(
  config: Pick<ConfigService, 'get'>,
  billingCycle: MembershipBillingCycle | undefined,
): void {
  if (!billingCycle || isSubscriptionTestTenuresEnabled(config)) return;
  if (TEST_MEMBERSHIP_CYCLES.has(billingCycle)) {
    throw new BadRequestException(
      '2-minute, 5-minute, 30-minute, 1-hour, 27-hour, and 1-day tenures are only available in the TechBV test environment',
    );
  }
}
