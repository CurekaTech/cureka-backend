export type AbandonedCartSkipReason =
  | 'guest_or_anonymous'
  | 'empty_cart'
  | 'invalid_phone'
  | 'recent_activity'
  | 'cooldown_24h'
  | 'in_flight'
  | 'inactive_cart'
  | 'purchased_or_emptied';

export type AbandonedCartEligibilityInput = {
  isGuest: boolean;
  isActiveCart: boolean;
  hasPositiveQuantityItem: boolean;
  hasValidPhone: boolean;
  lastActivityAt: Date;
  now: Date;
  inactivityMs: number;
  /** Latest provider-accepted or uncertain (timeout) attempt. */
  lastAcceptedOrUncertainAt: Date | null;
  cooldownMs: number;
  hasInFlightReservation: boolean;
};

export function evaluateAbandonedCartEligibility(
  input: AbandonedCartEligibilityInput,
): { eligible: boolean; reason?: AbandonedCartSkipReason } {
  if (input.isGuest) {
    return { eligible: false, reason: 'guest_or_anonymous' };
  }
  if (!input.isActiveCart) {
    return { eligible: false, reason: 'inactive_cart' };
  }
  if (!input.hasPositiveQuantityItem) {
    return { eligible: false, reason: 'purchased_or_emptied' };
  }
  if (!input.hasValidPhone) {
    return { eligible: false, reason: 'invalid_phone' };
  }

  const inactiveBefore = input.now.getTime() - input.inactivityMs;
  if (input.lastActivityAt.getTime() > inactiveBefore) {
    return { eligible: false, reason: 'recent_activity' };
  }

  if (input.hasInFlightReservation) {
    return { eligible: false, reason: 'in_flight' };
  }

  if (input.lastAcceptedOrUncertainAt) {
    const cooldownUntil = input.lastAcceptedOrUncertainAt.getTime() + input.cooldownMs;
    if (input.now.getTime() < cooldownUntil) {
      return { eligible: false, reason: 'cooldown_24h' };
    }
  }

  return { eligible: true };
}

export function isRetryableBobHttpStatus(httpStatus: number | null): boolean {
  if (httpStatus == null) return false;
  if (httpStatus === 408 || httpStatus === 429) return true;
  return httpStatus >= 500 && httpStatus <= 599;
}

export function sanitizeAbandonedCartError(error: string | null | undefined): string | null {
  if (!error) return null;
  const stripped = error
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[phone]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  return stripped.slice(0, 500);
}

export function maskPhoneForLog(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 4) return '****';
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
}
