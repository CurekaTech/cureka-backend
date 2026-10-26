const KOLKATA = 'Asia/Kolkata';

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

/** UPI debits are scheduled for the next Kolkata calendar day. Asia/Kolkata has no daylight saving. */
export function nextCashfreeUpiScheduleDate(now = new Date()): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
