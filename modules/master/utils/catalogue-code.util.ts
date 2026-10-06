/**
 * 3-letter catalogue code shared by brands and categories.
 *
 * 1. First 3 letters, padded with X. Himalaya Herbals → HIM. 3M → MXX.
 * 2. If that code is taken and the name has 2 or more letters, use the first
 *    letter and the last letter, padded with X. healthetc after Healthwise → HCX.
 * 3. If it is still taken, or the name has only one letter, advance the extra
 *    characters: MXX, MXY, MXZ, MYY, MYZ, MZZ, then the rest of A–Z.
 */
const PAD_SUFFIXES = ['XX', 'XY', 'XZ', 'YY', 'YZ', 'ZZ'] as const;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const lettersOf = (name: string): string =>
  (name.match(/[a-zA-Z]/g) ?? []).join('').toUpperCase();

const pushUnique = (candidates: string[], code: string): void => {
  if (!candidates.includes(code)) candidates.push(code);
};

export const catalogueCodeCandidates = (name: string, fallback: string): string[] => {
  const letters = lettersOf(name);
  const primary = (letters ? letters.slice(0, 3) : fallback.toUpperCase())
    .padEnd(3, 'X')
    .slice(0, 3);
  const candidates: string[] = [primary];

  if (letters.length >= 2) {
    pushUnique(candidates, `${letters[0]}${letters[letters.length - 1]}`.padEnd(3, 'X'));
  }

  const head = primary[0] ?? 'X';
  if (letters.length <= 1) {
    for (const suffix of PAD_SUFFIXES) {
      pushUnique(candidates, `${head}${suffix}`);
    }
  }

  for (const middle of ALPHABET) {
    for (const last of ALPHABET) {
      pushUnique(candidates, `${head}${middle}${last}`);
    }
  }

  return candidates;
};

/** First code for a name when nothing else is reserved. */
export const primaryCatalogueCode = (name: string, fallback: string): string =>
  catalogueCodeCandidates(name, fallback)[0] ?? fallback;

export const allocateCatalogueCode = (
  name: string,
  taken: ReadonlySet<string>,
  fallback: string,
): string => {
  for (const code of catalogueCodeCandidates(name, fallback)) {
    if (!taken.has(code)) return code;
  }
  throw new Error(`No unique catalogue code left for "${name}"`);
};
