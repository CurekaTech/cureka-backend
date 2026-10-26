import {
  evaluateAbandonedCartEligibility,
  isRetryableBobHttpStatus,
  sanitizeAbandonedCartError,
} from './abandoned-cart-eligibility.util';

const inactivityMs = 30 * 60_000;
const cooldownMs = 24 * 60 * 60_000;

const eligibleBase = {
  isGuest: false,
  isActiveCart: true,
  hasPositiveQuantityItem: true,
  hasValidPhone: true,
  lastActivityAt: new Date('2026-09-10T10:00:00.000Z'),
  now: new Date('2026-09-10T10:35:00.000Z'),
  inactivityMs,
  maxAgeMs: cooldownMs,
  lastSentActivityAt: null,
  lastAcceptedOrUncertainAt: null,
  cooldownMs,
  hasInFlightReservation: false,
};

describe('evaluateAbandonedCartEligibility', () => {
  it('queues a registered nonempty cart idle for more than 30 minutes', () => {
    expect(evaluateAbandonedCartEligibility(eligibleBase)).toEqual({ eligible: true });
  });

  it('skips guest carts, empty carts, and carts without a valid phone', () => {
    expect(evaluateAbandonedCartEligibility({ ...eligibleBase, isGuest: true }).reason).toBe(
      'guest_or_anonymous',
    );
    expect(
      evaluateAbandonedCartEligibility({ ...eligibleBase, hasPositiveQuantityItem: false }).reason,
    ).toBe('purchased_or_emptied');
    expect(evaluateAbandonedCartEligibility({ ...eligibleBase, hasValidPhone: false }).reason).toBe(
      'invalid_phone',
    );
  });

  it('resets eligibility when the customer recently mutated the cart', () => {
    expect(
      evaluateAbandonedCartEligibility({
        ...eligibleBase,
        lastActivityAt: new Date('2026-09-10T10:20:00.000Z'),
        now: new Date('2026-09-10T10:35:00.000Z'),
      }).reason,
    ).toBe('recent_activity');
  });

  it('blocks another accepted attempt for a rolling 24 hours including across midnight', () => {
    const acceptedAt = new Date('2026-09-10T23:30:00.000Z');
    const nextMorning = new Date('2026-09-11T10:00:00.000Z');
    expect(
      evaluateAbandonedCartEligibility({
        ...eligibleBase,
        now: nextMorning,
        lastAcceptedOrUncertainAt: acceptedAt,
      }).reason,
    ).toBe('cooldown_24h');
  });

  it('allows a new session after the 24-hour window when the cart changed', () => {
    const acceptedAt = new Date('2026-09-10T10:00:00.000Z');
    const afterWindow = new Date('2026-09-11T10:00:01.000Z');
    expect(
      evaluateAbandonedCartEligibility({
        ...eligibleBase,
        now: afterWindow,
        lastActivityAt: new Date('2026-09-11T09:25:00.000Z'),
        lastSentActivityAt: new Date('2026-09-10T09:00:00.000Z'),
        lastAcceptedOrUncertainAt: acceptedAt,
      }),
    ).toEqual({ eligible: true });
  });

  it('never re-sends the same idle session, even after 24 hours', () => {
    const activity = new Date('2026-09-11T09:00:00.000Z');
    expect(
      evaluateAbandonedCartEligibility({
        ...eligibleBase,
        now: new Date('2026-09-11T10:00:00.000Z'),
        lastActivityAt: activity,
        lastSentActivityAt: activity,
        lastAcceptedOrUncertainAt: null,
      }).reason,
    ).toBe('already_sent_for_session');
  });

  it('skips carts older than the max age window', () => {
    expect(
      evaluateAbandonedCartEligibility({
        ...eligibleBase,
        now: new Date('2026-09-12T10:00:00.000Z'),
        lastActivityAt: new Date('2026-09-10T10:00:00.000Z'),
      }).reason,
    ).toBe('stale_cart');
  });

  it('skips when another reservation is already in flight', () => {
    expect(
      evaluateAbandonedCartEligibility({ ...eligibleBase, hasInFlightReservation: true }).reason,
    ).toBe('in_flight');
  });
});

describe('abandoned-cart error helpers', () => {
  it('retries 5xx/429 but not auth or payload errors', () => {
    expect(isRetryableBobHttpStatus(503)).toBe(true);
    expect(isRetryableBobHttpStatus(429)).toBe(true);
    expect(isRetryableBobHttpStatus(401)).toBe(false);
    expect(isRetryableBobHttpStatus(null)).toBe(false);
  });

  it('strips phones and emails from persisted errors', () => {
    expect(sanitizeAbandonedCartError('fail +919876543210 user@test.com')).toBe(
      'fail [phone] [email]',
    );
  });
});
