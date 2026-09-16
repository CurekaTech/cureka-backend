/**
 * Serialize a DATE column as YYYY-MM-DD without shifting the calendar day in IST.
 * Prefer string prefixes and local date parts over toISOString() (UTC).
 */
export const formatDateOnly = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return match ? match[1] : null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
};
