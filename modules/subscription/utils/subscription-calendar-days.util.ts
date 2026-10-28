import { getZonedParts } from './next-billing-date.util';

/** Whole calendar days from `from` to `to` in the given IANA timezone. */
export function calendarDaysUntil(from: Date, to: Date, timeZone: string): number {
  const start = getZonedParts(from, timeZone);
  const end = getZonedParts(to, timeZone);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

/** Reminder offsets always include day-5 (business requirement) plus config. */
export function resolveReminderOffsets(configured?: number[] | null): number[] {
  const base = configured?.length ? configured : [7, 5, 2, 0];
  return Array.from(new Set([...base, 5])).sort((a, b) => b - a);
}
