import {
  normalizeMobileNumber,
  parseIndianMobileNumber,
} from '@modules/auth/utils/mobile-number.util';

export function toBobIndianMobile(input: string): string {
  const digits = normalizeMobileNumber(input);
  if (digits.length > 10) {
    return parseIndianMobileNumber(digits.slice(-10));
  }
  return parseIndianMobileNumber(digits);
}

export function parseMoneyAmount(value: string | number | undefined, fallback = 0): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
