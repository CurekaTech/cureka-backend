import {
  calendarDaysUntil,
  resolveReminderOffsets,
} from './subscription-calendar-days.util';

describe('subscription-calendar-days.util', () => {
  it('counts five Kolkata calendar days before renewal', () => {
    const asOf = new Date('2026-11-21T03:30:00.000Z'); // 21 Nov 09:00 IST
    const renewal = new Date('2026-11-25T18:30:00.000Z'); // 26 Nov 00:00 IST
    expect(calendarDaysUntil(asOf, renewal, 'Asia/Kolkata')).toBe(5);
  });

  it('always includes the day-5 reminder offset', () => {
    expect(resolveReminderOffsets([7, 2, 0])).toEqual([7, 5, 2, 0]);
    expect(resolveReminderOffsets(null)).toEqual([7, 5, 2, 0]);
  });
});
