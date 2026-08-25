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

type AddressLogSource = {
  email?: string | null;
  phone?: string | null;
} | null | undefined;

/**
 * Safe structured fields for address-bearing logs.
 * Never include name, email, phone, or full address in the message string.
 */
export function addressLogMeta(address: AddressLogSource): {
  hasShippingAddress: boolean;
  hasEmail: boolean;
  phoneMasked: string;
} {
  return {
    hasShippingAddress: Boolean(address),
    hasEmail: Boolean(address?.email?.trim()),
    phoneMasked: maskMobile(address?.phone),
  };
}
