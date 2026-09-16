import { formatDateOnly } from './date-only.util';

describe('formatDateOnly', () => {
  it('returns null for empty values', () => {
    expect(formatDateOnly(null)).toBeNull();
    expect(formatDateOnly(undefined)).toBeNull();
    expect(formatDateOnly('')).toBeNull();
  });

  it('keeps a YYYY-MM-DD string as-is', () => {
    expect(formatDateOnly('2026-03-15')).toBe('2026-03-15');
  });

  it('takes the date prefix from an ISO datetime string', () => {
    expect(formatDateOnly('2026-03-15T18:30:00.000Z')).toBe('2026-03-15');
  });

  it('uses local calendar parts for Date values (IST-safe for DATE columns)', () => {
    const localMidnight = new Date(2026, 2, 15, 0, 0, 0, 0);
    expect(formatDateOnly(localMidnight)).toBe('2026-03-15');
  });
});
