export const ADMIN_DATE_PRESETS = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
] as const;

export type AdminDatePreset = (typeof ADMIN_DATE_PRESETS)[number];

export type AdminDateRange = { start: Date; end: Date };

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type IstDateParts = { year: number; month: number; day: number };

function istDateParts(now: Date): IstDateParts {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function shiftIstDays(parts: IstDateParts, days: number): IstDateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function startOfIstDay(parts: IstDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month, parts.day) - IST_OFFSET_MS);
}

function endOfIstDay(parts: IstDateParts): Date {
  return new Date(
    Date.UTC(parts.year, parts.month, parts.day, 23, 59, 59, 999) - IST_OFFSET_MS,
  );
}

/**
 * Inclusive Asia/Kolkata calendar window for the admin date dropdown.
 * Returns null when no preset is selected so custom dates stay in effect.
 */
export function resolveAdminDatePreset(
  preset: AdminDatePreset | undefined,
  now: Date = new Date(),
): AdminDateRange | null {
  if (!preset) return null;

  const today = istDateParts(now);
  if (preset === 'today') {
    return { start: startOfIstDay(today), end: endOfIstDay(today) };
  }
  if (preset === 'yesterday') {
    const day = shiftIstDays(today, -1);
    return { start: startOfIstDay(day), end: endOfIstDay(day) };
  }
  if (preset === 'last_7_days') {
    return {
      start: startOfIstDay(shiftIstDays(today, -6)),
      end: endOfIstDay(today),
    };
  }
  if (preset === 'last_30_days') {
    return {
      start: startOfIstDay(shiftIstDays(today, -29)),
      end: endOfIstDay(today),
    };
  }
  return {
    start: startOfIstDay({ year: today.year, month: today.month, day: 1 }),
    end: endOfIstDay(today),
  };
}

/** Parse `YYYY-MM-DD` (or date-only ISO prefix) as an Asia/Kolkata calendar day. */
export function parseAdminCalendarDate(
  value: string | undefined,
): IstDateParts | null {
  if (!value?.trim()) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Inclusive Asia/Kolkata window for custom start/end date strings.
 * Same-day ranges cover the full calendar day (not a single UTC midnight).
 */
export function resolveAdminCustomDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  now: Date = new Date(),
): AdminDateRange {
  const today = istDateParts(now);
  let startParts = parseAdminCalendarDate(startDate);
  let endParts = parseAdminCalendarDate(endDate);

  if (!startParts && !endParts) {
    return {
      start: startOfIstDay({ year: today.year, month: today.month, day: 1 }),
      end: endOfIstDay(today),
    };
  }

  if (!endParts) endParts = today;
  if (!startParts) {
    startParts = { year: endParts.year, month: endParts.month, day: 1 };
  }

  let start = startOfIstDay(startParts);
  let end = endOfIstDay(endParts);
  if (start.getTime() > end.getTime()) {
    start = startOfIstDay(endParts);
    end = endOfIstDay(startParts);
  }
  return { start, end };
}
