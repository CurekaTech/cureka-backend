import { BadRequestException } from '@nestjs/common';

/** Indian mobile: 10 digits, starts with 6–9. */
export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export const INDIAN_MOBILE_VALIDATION_MESSAGE =
  'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.';

export function normalizeMobileNumber(input: string): string {
  return input.trim().replace(/\D/g, '');
}

/**
 * Canonical 10-digit Indian mobile for storage/comparison.
 * Accepts `9876543210`, `+919876543210`, `919876543210`, and `09876543210`.
 * Returns null when the value cannot be reduced to a valid Indian mobile.
 */
export function canonicalizeIndianMobileNumber(input: string): string | null {
  let digits = normalizeMobileNumber(input);
  if (!digits) {
    return null;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return INDIAN_MOBILE_REGEX.test(digits) ? digits : null;
}

export function isValidIndianMobile(mobile: string): boolean {
  return canonicalizeIndianMobileNumber(mobile) !== null;
}

export function parseCanonicalIndianMobileNumber(input: string): string {
  const canonical = canonicalizeIndianMobileNumber(input);
  if (!canonical) {
    throw new BadRequestException(INDIAN_MOBILE_VALIDATION_MESSAGE);
  }
  return canonical;
}

export function parseIndianMobileNumber(input: string): string {
  const normalized = normalizeMobileNumber(input);

  if (!normalized) {
    throw new BadRequestException('Mobile number is required.');
  }

  const canonical = canonicalizeIndianMobileNumber(input);
  if (canonical) {
    return canonical;
  }

  if (normalized.length !== 10) {
    throw new BadRequestException('Please enter a 10-digit mobile number.');
  }

  throw new BadRequestException(INDIAN_MOBILE_VALIDATION_MESSAGE);
}
