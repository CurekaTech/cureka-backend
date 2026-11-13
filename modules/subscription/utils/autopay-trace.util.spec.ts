import { AUTOPAY_TRACE, formatIstDate, isHourlyAutopayTrace } from './autopay-trace.util';

describe('autopay-trace.util', () => {
  it('formats timestamps in Asia/Kolkata offset', () => {
    expect(AUTOPAY_TRACE).toBe('[autopay-trace]');
    expect(formatIstDate(new Date('2026-11-15T04:30:00.000Z'))).toBe('2026-11-15T10:00:00+05:30');
  });

  it('marks the top of the UTC hour for wait-log throttling', () => {
    expect(isHourlyAutopayTrace(new Date('2026-11-15T04:00:10.000Z'))).toBe(true);
    expect(isHourlyAutopayTrace(new Date('2026-11-15T04:01:00.000Z'))).toBe(false);
  });
});
