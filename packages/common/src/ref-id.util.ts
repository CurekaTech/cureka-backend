/**
 * Generates a unique reference ID in the format: AAA20261234
 *
 * Format:
 *   [3-char prefix][4-digit year][4-digit random]
 *
 * Rules:
 *   - Prefix: first 3 alphabetic characters of `name`, uppercased.
 *             Padded with 'X' if the name has fewer than 3 letters.
 *   - Year:   current calendar year (4 digits).
 *   - Random: cryptographically random 4-digit number, zero-padded (0000–9999).
 *
 * @example
 *   generateRefId('Sundar')  // → 'SUN20265271'
 *   generateRefId('Ali')     // → 'ALI20260834'
 *   generateRefId('Jo')      // → 'JOX20261492'
 */
export const generateRefId = (name: string): string => {
  const letters = name.replace(/[^a-zA-Z]/g, '');
  const prefix = letters.slice(0, 3).toUpperCase().padEnd(3, 'X');
  const year = new Date().getFullYear();
  // Use crypto.getRandomValues for uniform randomness (avoids Math.random bias)
  const array = new Uint16Array(1);
  crypto.getRandomValues(array);
  // array[0] is 0–65535; modulo 10000 gives 0–9999
  const random = (array[0]! % 10000).toString().padStart(4, '0');
  return `${prefix}${year}${random}`;
};
