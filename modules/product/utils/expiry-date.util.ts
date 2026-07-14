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
    return String(value);
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
};
