import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';
import { isWithinWindow, resolveConfiguredWindow, resolveWindowExpiry } from './return-window.util';

describe('return window', () => {
  const deliveredAt = new Date('2026-01-10T00:00:00.000Z');

  it('counts days from the delivery timestamp', () => {
    expect(resolveWindowExpiry(deliveredAt, 7, PolicyWindowUnit.DAYS)).toEqual(
      new Date('2026-01-17T00:00:00.000Z'),
    );
  });

  it('counts hours for short windows', () => {
    expect(resolveWindowExpiry(deliveredAt, 48, PolicyWindowUnit.HOURS)).toEqual(
      new Date('2026-01-12T00:00:00.000Z'),
    );
  });

  it('returns null when the item has no delivery timestamp', () => {
    expect(resolveWindowExpiry(null, 7, PolicyWindowUnit.DAYS)).toBeNull();
  });

  it('uses the fallback when the configured window is missing or not positive', () => {
    expect(resolveConfiguredWindow(null, 2)).toBe(2);
    expect(resolveConfiguredWindow(undefined, 2)).toBe(2);
    expect(resolveConfiguredWindow(0, 2)).toBe(2);
    expect(resolveConfiguredWindow(-1, 2)).toBe(2);
    expect(resolveConfiguredWindow(7, 2)).toBe(7);
  });

  it('returns null for a zero or missing window', () => {
    expect(resolveWindowExpiry(deliveredAt, 0, PolicyWindowUnit.DAYS)).toBeNull();
    expect(resolveWindowExpiry(deliveredAt, null, PolicyWindowUnit.DAYS)).toBeNull();
  });

  it('treats the expiry instant itself as inside the window', () => {
    const expiresAt = resolveWindowExpiry(deliveredAt, 7, PolicyWindowUnit.DAYS);
    expect(isWithinWindow(expiresAt, new Date('2026-01-17T00:00:00.000Z'))).toBe(true);
    expect(isWithinWindow(expiresAt, new Date('2026-01-17T00:00:00.001Z'))).toBe(false);
  });

  it('treats a null expiry as outside the window', () => {
    expect(isWithinWindow(null, deliveredAt)).toBe(false);
  });
});
