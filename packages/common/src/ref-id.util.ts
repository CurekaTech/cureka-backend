/** Format: 3-letter prefix + 4-digit year + 4-digit random (11 chars total). */
export const REF_ID_PATTERN = /^[A-Z]{3}\d{8}$/;

export const REF_ID_LENGTH = 11;

export const MAX_REF_ID_GENERATION_ATTEMPTS = 20;

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
  const array = new Uint16Array(1);
  crypto.getRandomValues(array);
  const random = (array[0]! % 10000).toString().padStart(4, '0');
  return `${prefix}${year}${random}`;
};

/**
 * Generates a ref ID and retries until `exists` returns false.
 */
export const generateUniqueRefId = async (
  name: string,
  exists: (refId: string) => Promise<boolean>,
): Promise<string> => {
  for (let attempt = 0; attempt < MAX_REF_ID_GENERATION_ATTEMPTS; attempt++) {
    const refId = generateRefId(name);
    if (!(await exists(refId))) {
      return refId;
    }
  }

  throw new Error(
    `Failed to generate unique ref ID after ${MAX_REF_ID_GENERATION_ATTEMPTS} attempts`,
  );
};

export const isValidRefId = (value: string): boolean => REF_ID_PATTERN.test(value);
