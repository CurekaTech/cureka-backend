import { MembershipBillingCycle } from '../enums/membership-billing-cycle.enum';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import {
  PRODUCT_FREQUENCY_MONTHS,
  SUBSCRIPTION_DEFAULT_TIMEZONE,
} from '../constants/subscription.constants';

const MEMBERSHIP_BILLING_CYCLE_MONTHS: Record<MembershipBillingCycle, number> = {
  [MembershipBillingCycle.MONTHLY]: 1,
  [MembershipBillingCycle.QUARTERLY]: 3,
  [MembershipBillingCycle.YEARLY]: 12,
};

export type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || SUBSCRIPTION_DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const named = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(named.year),
    month: Number(named.month),
    day: Number(named.day),
    hour: Number(named.hour),
    minute: Number(named.minute),
    second: Number(named.second),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function zonedDateFromParts(parts: ZonedDateParts, timeZone: string): Date {
  const guessUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let instant = new Date(guessUtc);
  for (let i = 0; i < 3; i += 1) {
    const actual = getZonedParts(instant, timeZone);
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const targetUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const delta = targetUtc - actualUtc;
    if (delta === 0) break;
    instant = new Date(instant.getTime() + delta);
  }
  return instant;
}

export function addCalendarMonths(
  date: Date,
  months: number,
  timeZone = SUBSCRIPTION_DEFAULT_TIMEZONE,
  anchorDay?: number | null,
): Date {
  const parts = getZonedParts(date, timeZone);
  const totalMonths = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const preferredDay = anchorDay && anchorDay > 0 ? anchorDay : parts.day;
  const day = Math.min(preferredDay, daysInMonth(year, month));
  return zonedDateFromParts({ ...parts, year, month, day }, timeZone);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** @deprecated UTC overflow helper — prefer addCalendarMonths for product schedules. */
export function addMonths(date: Date, months: number): Date {
  return addCalendarMonths(date, months, 'UTC');
}

export function getNextProductBillingDate(
  from: Date,
  frequency: ProductSubscriptionFrequency,
  timeZone = SUBSCRIPTION_DEFAULT_TIMEZONE,
  anchorDay?: number | null,
): Date {
  return addCalendarMonths(from, PRODUCT_FREQUENCY_MONTHS[frequency], timeZone, anchorDay);
}

export function getEstimatedDeliveryDate(chargeDate: Date, deliveryLeadDays: number): Date {
  return addDays(chargeDate, Math.max(0, deliveryLeadDays));
}

export function getNextMembershipBillingDate(
  from: Date,
  billingCycle: MembershipBillingCycle,
): Date {
  return addCalendarMonths(from, MEMBERSHIP_BILLING_CYCLE_MONTHS[billingCycle], 'UTC');
}

export function scheduleAnchorDay(date: Date, timeZone = SUBSCRIPTION_DEFAULT_TIMEZONE): number {
  return getZonedParts(date, timeZone).day;
}

/**
 * After downtime, never catch-up charge every missed cycle.
 * Advance the schedule until the next charge is in the future (or today),
 * counting how many cycles were skipped.
 */
export function advancePastMissedCycles(params: {
  nextBillingDate: Date;
  frequency: ProductSubscriptionFrequency;
  asOfDate: Date;
  timeZone?: string;
  anchorDay?: number | null;
}): { nextBillingDate: Date; skippedCount: number } {
  const timeZone = params.timeZone ?? SUBSCRIPTION_DEFAULT_TIMEZONE;
  let cursor = params.nextBillingDate;
  let skipped = 0;
  const interval = PRODUCT_FREQUENCY_MONTHS[params.frequency];
  while (cursor.getTime() < params.asOfDate.getTime()) {
    const following = addCalendarMonths(cursor, interval, timeZone, params.anchorDay);
    if (following.getTime() <= params.asOfDate.getTime()) {
      skipped += 1;
      cursor = following;
      continue;
    }
    break;
  }
  return { nextBillingDate: cursor, skippedCount: skipped };
}
