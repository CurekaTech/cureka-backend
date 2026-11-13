import { formatCashfreeScheduleDate } from './cashfree-schedule-date.util';

/** Grep API / PM2 logs for this string after a 27h / 48h UPI test. */
export const AUTOPAY_TRACE = '[autopay-trace]';

export function formatIstDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return formatCashfreeScheduleDate(date);
}

/** True about once per hour when the test-tenure job runs every 60s. */
export function isHourlyAutopayTrace(asOf: Date): boolean {
  return asOf.getUTCMinutes() === 0;
}
