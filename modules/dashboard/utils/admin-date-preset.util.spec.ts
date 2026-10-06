import { resolveAdminDatePreset } from './admin-date-preset.util';

describe('resolveAdminDatePreset', () => {
  const now = new Date('2026-10-01T05:28:00.000Z');

  it('uses the Asia/Kolkata calendar day for today', () => {
    const range = resolveAdminDatePreset('today', now);
    expect(range?.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-10-01T18:29:59.999Z');
  });

  it('uses the previous Asia/Kolkata day for yesterday', () => {
    const range = resolveAdminDatePreset('yesterday', now);
    expect(range?.start.toISOString()).toBe('2026-09-29T18:30:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-09-30T18:29:59.999Z');
  });

  it('includes today and the previous six days for last 7 days', () => {
    const range = resolveAdminDatePreset('last_7_days', now);
    expect(range?.start.toISOString()).toBe('2026-09-24T18:30:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-10-01T18:29:59.999Z');
  });

  it('includes today and the previous 29 days for last 30 days', () => {
    const range = resolveAdminDatePreset('last_30_days', now);
    expect(range?.start.toISOString()).toBe('2026-09-01T18:30:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-10-01T18:29:59.999Z');
  });

  it('uses the first of the Asia/Kolkata month through today for this month', () => {
    const range = resolveAdminDatePreset('this_month', now);
    expect(range?.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-10-01T18:29:59.999Z');
  });

  it('returns null when the preset is omitted', () => {
    expect(resolveAdminDatePreset(undefined, now)).toBeNull();
  });
});
