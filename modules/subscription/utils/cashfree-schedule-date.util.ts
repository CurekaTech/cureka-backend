import { getZonedParts } from './next-billing-date.util';

const KOLKATA = 'Asia/Kolkata';

/** Official Cashfree UPI AutoPay T+1 cutoff (Asia/Kolkata). */
export const CASHFREE_UPI_T1_CUTOFF_HOUR_IST = 21;

/**
 * Conservative Indian-card / eNACH T+1 window. Published Cashfree tables differ
 * on same-day card SI; same-day is never requested.
 */
export const CASHFREE_CARD_T1_OPEN_HOUR_IST = 7;
export const CASHFREE_CARD_T1_CUTOFF_HOUR_IST = 21;

/** Cashfree Charge API accepts a schedule date through T+14. */
export const CASHFREE_CHARGE_MAX_LEAD_DAYS = 14;

export const CASHFREE_MISSED_SCHEDULE_REASON = 'MISSED_SCHEDULE';

export type CashfreeChargeMethod = 'upi' | 'card' | 'enach';

export type CashfreeScheduleDecision =
  | { outcome: 'schedule'; scheduleDate: Date; reason: string }
  | { outcome: 'wait'; reason: string }
  | { outcome: 'missed'; reason: string };

/** Cashfree `payment_schedule_date` examples use an Asia/Kolkata offset, not a UTC `Z` instant. */
export function formatCashfreeScheduleDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: KOLKATA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}+05:30`;
}

export function normalizeCashfreeChargeMethod(method?: string | null): CashfreeChargeMethod {
  const value = (method ?? '').trim().toLowerCase();
  if (value === 'upi') return 'upi';
  if (value === 'enach' || value === 'emandate' || value === 'nach') return 'enach';
  return 'card';
}

export function kolkataCalendarDaysBetween(from: Date, to: Date): number {
  const start = getZonedParts(from, KOLKATA);
  const end = getZonedParts(to, KOLKATA);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

/**
 * Decide whether a Cashfree ON_DEMAND CHARGE can be raised so the debit lands
 * on `intended` (the subscription billing date) in Asia/Kolkata.
 *
 * The Charge API sends the pre-debit notification. We never request same-day.
 * A missed window is not shifted to a later debit date.
 *
 * Card / eNACH: Cashfree FAQ cut-off table lists SI on cards as Not Allowed for
 * T+1; only T+2…T+14. Prefer that conservative table over the Charge page row
 * that allows Indian-card T+1, so renewals do not raise a rejected CHARGE.
 * UPI: T+1 remains allowed before 21:00 IST.
 */
export function resolveCashfreeChargeSchedule(params: {
  intended: Date;
  now?: Date;
  method?: string | null;
}): CashfreeScheduleDecision {
  const now = params.now ?? new Date();
  const method = normalizeCashfreeChargeMethod(params.method);
  const deltaDays = kolkataCalendarDaysBetween(now, params.intended);
  const hour = getZonedParts(now, KOLKATA).hour;
  const cardLike = method === 'card' || method === 'enach';

  if (deltaDays > CASHFREE_CHARGE_MAX_LEAD_DAYS) {
    return {
      outcome: 'wait',
      reason: `Intended debit is ${deltaDays} Kolkata days away; Cashfree allows at most T+${CASHFREE_CHARGE_MAX_LEAD_DAYS}`,
    };
  }
  if (deltaDays < 1) {
    return {
      outcome: 'missed',
      reason: `Same-day or past Cashfree ${method} CHARGE is not supported`,
    };
  }
  if (cardLike && deltaDays < 2) {
    return {
      outcome: 'wait',
      reason: 'Card/eNACH CHARGE requires at least T+2 (Cashfree FAQ: SI on cards T+1 not allowed)',
    };
  }
  if (deltaDays === 1) {
    if (hour >= CASHFREE_UPI_T1_CUTOFF_HOUR_IST) {
      return { outcome: 'missed', reason: 'UPI T+1 cutoff is 21:00 IST' };
    }
    return { outcome: 'schedule', scheduleDate: params.intended, reason: 'UPI T+1 before 21:00 IST' };
  }
  return {
    outcome: 'schedule',
    scheduleDate: params.intended,
    reason: `T+${deltaDays} is inside the Cashfree Charge window`,
  };
}

/** Next slot Cashfree will accept when the intended debit is same-day or already past. */
export function nextLegalCashfreeChargeDate(params: {
  now?: Date;
  method?: string | null;
}): Date {
  const now = params.now ?? new Date();
  const method = normalizeCashfreeChargeMethod(params.method);
  if (method === 'card' || method === 'enach') {
    return nextCashfreeCardScheduleDate(now);
  }
  return nextCashfreeUpiScheduleDate(now);
}

/** Earliest safe Cashfree card/eNACH schedule when advance scheduling is off. */
export function nextCashfreeCardScheduleDate(now = new Date()): Date {
  const parts = getZonedParts(now, KOLKATA);
  const startOfTodayUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  // T+2 at 00:00 Asia/Kolkata (= previous calendar day 18:30Z while IST has no DST).
  return new Date(startOfTodayUtc + 2 * 86_400_000 - (5 * 60 + 30) * 60 * 1000);
}

/**
 * Legacy fallback when advance scheduling is disabled: next instant + 24h.
 * This is not an intended billing date and must not be used as a live AutoPay SLA.
 */
export function nextCashfreeUpiScheduleDate(now = new Date()): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export function cashfreeChargeAttemptMetadata(params: {
  raw?: Record<string, unknown> | null;
  scheduleDate?: Date | null;
  accepted?: boolean;
  pending?: boolean;
  failureReason?: string | null;
}): Record<string, unknown> {
  const raw = params.raw ?? {};
  return {
    scheduledDebitAt: params.scheduleDate ? params.scheduleDate.toISOString() : null,
    accepted: params.accepted ?? null,
    pending: params.pending ?? null,
    paymentId: raw['payment_id'] ?? null,
    cfPaymentId: raw['cf_payment_id'] ?? null,
    paymentStatus: raw['payment_status'] ?? raw['status'] ?? null,
    scheduledOn: raw['payment_schedule_date'] ?? raw['scheduled_on'] ?? null,
    failureReason: raw['failure_reason'] ?? params.failureReason ?? null,
  };
}
