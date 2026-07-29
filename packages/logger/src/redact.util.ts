/**
 * Mask a mobile/phone number for application logs.
 * Keeps the last 4 digits when possible: 9876543210 → ***3210
 */
export function maskMobile(mobile: string | null | undefined): string {
  if (mobile == null) {
    return '';
  }

  const digits = String(mobile).replace(/\D/g, '');
  if (!digits) {
    return '***';
  }

  if (digits.length <= 4) {
    return `***${digits}`;
  }

  return `***${digits.slice(-4)}`;
}
