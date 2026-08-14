import { buildBillingCycleRef } from './billing-cycle-ref.util';

describe('buildBillingCycleRef', () => {
  it('formats UTC date as YYYY-MM-DD', () => {
    expect(buildBillingCycleRef(new Date(Date.UTC(2026, 7, 14)))).toBe('2026-08-14');
  });

  it('zero-pads month and day', () => {
    expect(buildBillingCycleRef(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
  });
});
