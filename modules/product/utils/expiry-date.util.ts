/** Accepts `dd-mm-yyyy` (preferred) or `yyyy-mm-dd`; returns ISO `yyyy-mm-dd` for DB storage. */
export const normalizeExpiryDateInput = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const raw = String(value).trim();
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);

  let year: number;
  let month: number;
  let day: number;

  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  } else {
    return raw;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return raw;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Formats a DB date (`yyyy-mm-dd` or Date) as `dd-mm-yyyy` for API responses. */
export const formatExpiryDateOutput = (value: string | Date | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const raw =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).trim().slice(0, 10);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    // Already `dd-mm-yyyy` (or another display string) — pass through.
    const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value).trim());
    if (dmy) {
      return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;
    }
    return String(value);
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
};

/** Adds calendar months, clamping the day to the last day of the target month. */
export const addCalendarMonths = (from: Date, months: number): Date => {
  const day = from.getDate();
  const totalMonths = from.getFullYear() * 12 + from.getMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDayOfMonth));
};

/**
 * Public product expiry for API responses (`dd-mm-yyyy`):
 * 1. Prefer stored `expiryDate` when present
 * 2. Else if `expiresInMonths` is set, return today + that many months
 * 3. Else null
 */
export const resolvePublicExpiryDate = (
  expiryDate: string | Date | null | undefined,
  expiresInMonths: number | null | undefined,
  fromDate: Date = new Date(),
): string | null => {
  const stored = formatExpiryDateOutput(expiryDate);
  if (stored) {
    return stored;
  }

  if (
    expiresInMonths === null ||
    expiresInMonths === undefined ||
    !Number.isFinite(expiresInMonths) ||
    expiresInMonths <= 0
  ) {
    return null;
  }

  const target = addCalendarMonths(fromDate, Math.floor(expiresInMonths));
  const dd = String(target.getDate()).padStart(2, '0');
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const yyyy = String(target.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
};
