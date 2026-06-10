import { BadRequestException } from '@nestjs/common';

/** Indian mobile: 10 digits, starts with 6–9. */
export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export const INDIAN_MOBILE_VALIDATION_MESSAGE =
  'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.';

export function normalizeMobileNumber(input: string): string {
  return input.trim().replace(/\D/g, '');
}

export function isValidIndianMobile(mobile: string): boolean {
  return INDIAN_MOBILE_REGEX.test(normalizeMobileNumber(mobile));
}

export function parseIndianMobileNumber(input: string): string {
  const normalized = normalizeMobileNumber(input);

  if (!normalized) {
    throw new BadRequestException('Mobile number is required.');
  }

  if (normalized.length !== 10) {
    throw new BadRequestException('Please enter a 10-digit mobile number.');
  }

  if (!INDIAN_MOBILE_REGEX.test(normalized)) {
    throw new BadRequestException(INDIAN_MOBILE_VALIDATION_MESSAGE);
  }

  return normalized;
}
