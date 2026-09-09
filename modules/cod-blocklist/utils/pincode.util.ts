export const INDIAN_PINCODE_REGEX = /^\d{6}$/;

export const INDIAN_PINCODE_VALIDATION_MESSAGE =
  'pincode must be a valid 6-digit Indian pincode';

export function normalizePincode(input: string): string {
  return input.trim();
}

export function isValidIndianPincode(input: string): boolean {
  return INDIAN_PINCODE_REGEX.test(normalizePincode(input));
}
