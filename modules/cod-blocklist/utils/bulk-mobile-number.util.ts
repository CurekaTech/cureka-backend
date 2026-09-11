/**
 * Strict Indian mobile rules for COD blocklist bulk upload sheets.
 * Unlike auth canonicalize (which strips 91 / leading 0), bulk upload requires
 * exactly 10 digits starting with 6–9 — no prefixes, spaces, or notation.
 */
export const BULK_INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export type BulkMobileValidationSuccess = {
  ok: true;
  mobileNumber: string;
};

export type BulkMobileValidationFailure = {
  ok: false;
  reason: string;
  suggestedFix: string;
};

export type BulkMobileValidationResult =
  | BulkMobileValidationSuccess
  | BulkMobileValidationFailure;

const fail = (reason: string, suggestedFix: string): BulkMobileValidationFailure => ({
  ok: false,
  reason,
  suggestedFix,
});

/**
 * Validate a sheet mobile value after outer trim.
 * Accepts only exact 10-digit numbers starting with 6–9.
 */
export function validateStrictBulkIndianMobile(
  raw: string | null | undefined,
): BulkMobileValidationResult {
  if (raw == null) {
    return fail(
      'Mobile number is required',
      'Enter a 10-digit mobile number starting with 6, 7, 8, or 9',
    );
  }

  const trimmed = String(raw).trim();
  if (!trimmed) {
    return fail(
      'Mobile number is required',
      'Enter a 10-digit mobile number starting with 6, 7, 8, or 9',
    );
  }

  if (/^null$/i.test(trimmed)) {
    return fail(
      'Mobile number cannot be NULL',
      'Enter a 10-digit mobile number starting with 6, 7, 8, or 9',
    );
  }

  // Scientific notation / decimals (e.g. 8.24E+09, 8238061585.0 as text)
  if (/[eE]/.test(trimmed) || trimmed.includes('.')) {
    return fail(
      'Mobile number must be exactly 10 digits (decimals and scientific notation are not allowed)',
      'Enter the number as plain 10 digits, e.g. 8238061585',
    );
  }

  // Letters, spaces, hyphens, plus, etc.
  if (!/^\d+$/.test(trimmed)) {
    return fail(
      'Mobile number must contain only digits (no spaces, letters, or special characters)',
      'Enter digits only, e.g. 8238061585',
    );
  }

  if (trimmed.length === 12 && trimmed.startsWith('91')) {
    return fail(
      'Do not include country code 91',
      'Enter the 10-digit mobile number only, e.g. 8238061585',
    );
  }

  if (trimmed.length === 11 && trimmed.startsWith('0')) {
    return fail(
      'Do not include a leading 0',
      'Enter the 10-digit mobile number only, e.g. 8238061585',
    );
  }

  if (trimmed.length !== 10) {
    return fail(
      `Mobile number must be exactly 10 digits (got ${trimmed.length})`,
      'Enter exactly 10 digits starting with 6, 7, 8, or 9',
    );
  }

  if (trimmed.startsWith('0')) {
    return fail(
      'Do not include a leading 0',
      'Enter the 10-digit mobile number only, e.g. 8238061585',
    );
  }

  if (!/^[6-9]/.test(trimmed)) {
    return fail(
      'Mobile number must start with 6, 7, 8, or 9',
      'Use a number beginning with 6–9, e.g. 8238061585',
    );
  }

  if (!BULK_INDIAN_MOBILE_REGEX.test(trimmed)) {
    return fail(
      'Mobile number must be a valid 10-digit Indian mobile number',
      'Enter exactly 10 digits starting with 6, 7, 8, or 9',
    );
  }

  return { ok: true, mobileNumber: trimmed };
}
