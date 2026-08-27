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

/** BOB notify examples use E.164: +919150826341 */
export function toBobE164Phone(input: string | null | undefined): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const digits = normalizeMobileNumber(raw);
  const ten = digits.length >= 10 ? digits.slice(-10) : '';
  if (ten.length === 10) {
    return `+91${ten}`;
  }
  if (raw.startsWith('+')) return raw;
  return digits ? `+${digits}` : raw;
}

/** BOB examples use id / id_alias like #ORD415182630438 */
export function toBobOrderAlias(orderNumber: string | null | undefined): string {
  const value = String(orderNumber ?? '').trim();
  if (!value) return '';
  return value.startsWith('#') ? value : `#${value}`;
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
