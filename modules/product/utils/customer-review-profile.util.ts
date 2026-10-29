export type ReviewLocationParts = {
  city?: string | null;
  state?: string | null;
};

/**
 * Completed years of age from DOB (birthday-aware). Returns null when DOB is missing/invalid.
 */
export function calculateAgeYears(
  dob: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (dob == null) return null;

  const birth = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = now.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  if (age < 0 || age > 150) return null;
  return age;
}

/**
 * Shopper review location snapshot: city and state only.
 * Trims whitespace, omits empty parts, never includes street/pincode/country.
 */
export function formatReviewLocation(parts: ReviewLocationParts): string | null {
  const city = parts.city?.trim() ?? '';
  const state = parts.state?.trim() ?? '';

  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return null;
}
