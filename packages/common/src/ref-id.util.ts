ï»¿/** Format: 3-letter prefix + 4-digit year + 4-6 digit random (11 or 13 chars). */
export const REF_ID_PATTERN = /^[A-Z]{3}\d{8}(\d{2})?$/;

/** Legacy length used by existing rows. New IDs use 13 chars. */
export const REF_ID_LENGTH = 11;
export const REF_ID_LENGTH_V2 = 13;

export const MAX_REF_ID_GENERATION_ATTEMPTS = 10_000;

const RANDOM_DIGITS = 6;
const RANDOM_MODULO = 1_000_000;

/**
 * Generates a unique reference ID in the format: AAA2026123456
 *
 * Format:
 *   [3-char prefix][4-digit year][6-digit random]
 *
 * Rules:
 *   - Prefix: first 3 alphabetic characters of `name`, uppercased.
 *             Padded with 'X' if the name has fewer than 3 letters.
 *   - Year:   current calendar year (4 digits).
 *   - Random: cryptographically random 6-digit number, zero-padded (000000-999999).
 *
 * @example
 *   generateRefId('Sundar')  // -> 'SUN2026652714'
 *   generateRefId('Ali')     // -> 'ALI2026083412'
 *   generateRefId('Jo')      // -> 'JOX2026149203'
 */
export const generateRefId = (name: string): string => {
  const letters = name.replace(/[^a-zA-Z]/g, '');
  const prefix = letters.slice(0, 3).toUpperCase().padEnd(3, 'X');
  const year = new Date().getFullYear();
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const random = (array[0]! % RANDOM_MODULO).toString().padStart(RANDOM_DIGITS, '0');
  return `${prefix}${year}${random}`;
};

/**
 * Generates a ref ID and retries until `exists` returns false.
 * Walks the random space from a random start so bulk imports do not fail
 * after a few unlucky collisions on a busy prefix (e.g. many "Vissco" products).
 */
export const generateUniqueRefId = async (
  name: string,
  exists: (refId: string) => Promise<boolean>,
): Promise<string> => {
  const letters = name.replace(/[^a-zA-Z]/g, '');
  const prefix = letters.slice(0, 3).toUpperCase().padEnd(3, 'X');
  const year = new Date().getFullYear();
  const base = `${prefix}${year}`;

  const startArray = new Uint32Array(1);
  crypto.getRandomValues(startArray);
  const start = startArray[0]! % RANDOM_MODULO;

  for (let attempt = 0; attempt < MAX_REF_ID_GENERATION_ATTEMPTS; attempt++) {
    const random = ((start + attempt) % RANDOM_MODULO).toString().padStart(RANDOM_DIGITS, '0');
    const refId = `${base}${random}`;
    if (!(await exists(refId))) {
      return refId;
    }
  }

  throw new Error(
    `Failed to generate unique ref ID after ${MAX_REF_ID_GENERATION_ATTEMPTS} attempts`,
  );
};

export const isValidRefId = (value: string | null | undefined): boolean => {
  if (value == null) return false;
  return REF_ID_PATTERN.test(String(value).trim().toUpperCase());
};
