import {
  CASHFREE_MISSED_SCHEDULE_REASON,
  formatCashfreeScheduleDate,
  kolkataCalendarDaysBetween,
  nextCashfreeUpiScheduleDate,
  resolveCashfreeChargeSchedule,
} from './cashfree-schedule-date.util';

describe('cashfree-schedule-date.util', () => {
  const intendedNov26 = new Date('2026-11-25T18:30:00.000Z'); // 26 Nov 2026 00:00 IST

  it('formats payment_schedule_date with a Kolkata offset, not Z', () => {
    const formatted = formatCashfreeScheduleDate(intendedNov26);
    expect(formatted).toBe('2026-11-26T00:00:00+05:30');
    expect(formatted.endsWith('Z')).toBe(false);
  });

  it('counts Kolkata calendar days, not a blind 24-hour offset', () => {
    const nov25_0300Ist = new Date('2026-11-24T21:30:00.000Z');
    expect(kolkataCalendarDaysBetween(nov25_0300Ist, intendedNov26)).toBe(1);
  });

  it('schedules UPI on D-1 before 21:00 IST for an intended debit on D', () => {
    const nov25_0300Ist = new Date('2026-11-24T21:30:00.000Z');
    const decision = resolveCashfreeChargeSchedule({
      intended: intendedNov26,
      now: nov25_0300Ist,
      method: 'upi',
    });
    expect(decision).toEqual({
      outcome: 'schedule',
      scheduleDate: intendedNov26,
      reason: 'UPI T+1 before 21:00 IST',
    });
  });

  it('does not shift UPI after the 21:00 IST T+1 cutoff', () => {
    const nov25_2130Ist = new Date('2026-11-25T16:00:00.000Z');
    const decision = resolveCashfreeChargeSchedule({
      intended: intendedNov26,
      now: nov25_2130Ist,
      method: 'upi',
    });
    expect(decision.outcome).toBe('missed');
    expect(decision.reason).toContain('21:00 IST');
  });

  it('waits for Indian card T+1 before 07:00 IST and schedules T+2 instead', () => {
    const nov25_0300Ist = new Date('2026-11-24T21:30:00.000Z');
    expect(
      resolveCashfreeChargeSchedule({
        intended: intendedNov26,
        now: nov25_0300Ist,
        method: 'card',
      }).outcome,
    ).toBe('wait');

    const nov24_0300Ist = new Date('2026-11-23T21:30:00.000Z');
    const tPlus2 = resolveCashfreeChargeSchedule({
      intended: intendedNov26,
      now: nov24_0300Ist,
      method: 'card',
    });
    expect(tPlus2).toMatchObject({ outcome: 'schedule', scheduleDate: intendedNov26 });
  });

  it('never schedules a same-day or 5-minute Cashfree debit', () => {
    const now = new Date('2026-11-26T08:00:00.000Z');
    const fiveMinutes = new Date(now.getTime() + 5 * 60 * 1000);
    expect(
      resolveCashfreeChargeSchedule({ intended: fiveMinutes, now, method: 'upi' }).outcome,
    ).toBe('missed');
    expect(
      resolveCashfreeChargeSchedule({ intended: now, now, method: 'card' }).outcome,
    ).toBe('missed');
  });

  it('waits when the intended date is beyond T+14', () => {
    const now = new Date('2026-11-01T00:00:00.000Z');
    const decision = resolveCashfreeChargeSchedule({
      intended: intendedNov26,
      now,
      method: 'upi',
    });
    expect(decision.outcome).toBe('wait');
  });

  it('keeps the legacy +24h helper only for the rollback path', () => {
    const now = new Date('2026-11-25T10:00:00.000Z');
    expect(nextCashfreeUpiScheduleDate(now).getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(CASHFREE_MISSED_SCHEDULE_REASON).toBe('MISSED_SCHEDULE');
  });
});
