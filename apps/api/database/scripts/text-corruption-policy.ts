/**
 * Proposed catalog Unicode policy. This is an engineering allowlist for
 * automatic repair, not a final business-approved character set.
 */

export type FindingStatus =
  | 'SAFE_AUTO_REPAIR'
  | 'MANUAL_REVIEW'
  | 'SOURCE_REQUIRED'
  | 'VALID_UNICODE'
  | 'UNSUPPORTED_CHARACTER';

export type FindingConfidence = 'high' | 'medium' | 'low';

export type CellFinding = {
  csvRow: number;
  sku: string;
  productId: string;
  productName: string;
  column: string;
  original: string;
  repaired: string;
  fragment: string;
  codePoints: string;
  category: string;
  suggested: string | null;
  confidence: FindingConfidence;
  status: FindingStatus;
  reason: string;
};

/** Confirmed meaningful catalog characters. Do not strip these. */
export const ALLOWED_CODE_POINTS = new Set<number>([
  0x09, 0x0a, 0x0d, 0x20, 0xa0, 0xa9, 0xae, 0xb0, 0xb1, 0xb5, 0xb7, 0xd7, 0xf7,
  0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20b9, 0x2103,
  0x2109, 0x2122, 0x2212, 0x2264, 0x2265, 0x03b1, 0x03b2, 0x03bc, 0x2082, 0x25aa,
]);

export const FORBIDDEN_REASONS = new Set([
  'unrecoverable_replacement_character',
  'c1_control_character',
  'c0_control_character',
  'incomplete_punctuation_mojibake',
  'incomplete_emoji_mojibake',
  'incomplete_ligature_mojibake',
  'stray_utf8_lead_byte',
]);

export const REVIEW_REASONS = new Set([
  'ring_above_not_temperature',
  'suspicious_cent_sign',
  'suspicious_small_tilde',
  'soft_hyphen',
  'spaced_curly_quote',
  'curly_quote_between_numbers',
  'malformed_numeric_expression',
  'ambiguous_or_incomplete_mojibake',
]);

export function codePointsOf(value: string): string {
  return [...value]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join(' ');
}

export function isAllowedCodePoint(codePoint: number): boolean {
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return true;
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (ALLOWED_CODE_POINTS.has(codePoint)) return true;
  if (codePoint >= 0xc0 && codePoint <= 0x24f) return true;
  if (codePoint >= 0x370 && codePoint <= 0x3ff) return true;
  if (codePoint >= 0x1f00 && codePoint <= 0x1fff) return true;
  if (codePoint >= 0x2070 && codePoint <= 0x209f) return true;
  if (codePoint >= 0x2150 && codePoint <= 0x218f) return true;
  if (codePoint >= 0x2190 && codePoint <= 0x21ff) return true;
  if (codePoint >= 0x2200 && codePoint <= 0x22ff) return true;
  if (codePoint >= 0x1f300 && codePoint <= 0x1faff) return true;
  return false;
}

export function hasForbiddenCorruption(
  unresolved: Array<{ reason: string }>,
): boolean {
  return unresolved.some((item) => FORBIDDEN_REASONS.has(item.reason));
}
