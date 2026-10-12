const SENSITIVE_KEY = /^(password|passwd|otp|pin|token|accesstoken|refreshtoken|sessiontoken|secret|cookie|cookies|authorization|auth|cvv|cvc|pan|cardnumber|upipin|accountnumber|bankaccountnumber|ifsc|bankifsc)$/i;

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export const isSensitiveAuditKey = (key: string): boolean => SENSITIVE_KEY.test(normalizeKey(key));

export function maskAuditEmail(email: string | null | undefined): string {
  if (!email?.trim()) return '';
  const [local, domain] = email.trim().split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

export function maskAuditMobile(mobile: string | null | undefined): string {
  if (mobile == null) return '';
  const digits = String(mobile).replace(/\D/g, '');
  if (!digits) return '***';
  return `***${digits.slice(-4)}`;
}

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]';
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveAuditKey(key)) {
        output[key] = '[redacted]';
        continue;
      }
      output[key] = redactAuditValue(nested, depth + 1);
    }
    return output;
  }
  return value;
}

export function redactAuditDetails(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!details) return null;
  return redactAuditValue(details) as Record<string, unknown>;
}
