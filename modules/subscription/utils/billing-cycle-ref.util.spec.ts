import { buildBillingCycleRef } from './billing-cycle-ref.util';

describe('buildBillingCycleRef', () => {
  it('formats UTC date as YYYY-MM-DD', () => {
    expect(buildBillingCycleRef(new Date(Date.UTC(2026, 7, 14)))).toBe('2026-08-14');
  });

  it('zero-pads month and day', () => {
    expect(buildBillingCycleRef(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
  });

  it('keeps monthly refs date-only and slots short TechBV tenures', () => {
    const at = new Date(Date.UTC(2026, 9, 23, 14, 40, 0));
    expect(buildBillingCycleRef(at, 'MONTHLY')).toBe('2026-10-23');
    expect(buildBillingCycleRef(at, 'HOURLY')).toBe('2026-10-23T1400Z');
    expect(buildBillingCycleRef(at, 'MINUTES_30')).toBe('2026-10-23T1430Z');
    expect(buildBillingCycleRef(new Date(Date.UTC(2026, 9, 23, 14, 10, 0)), 'MINUTES_30')).toBe(
      '2026-10-23T1400Z',
    );
  });
});
